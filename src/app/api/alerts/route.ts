import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { loadIncidents } from '@/lib/incident-store'
import { getAlertStats } from '@/lib/telemetry-store'
import { getThresholdAlerts } from '@/lib/threshold-alerts'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const conns = loadConnections().filter(c => !connId || c.id === connId)
  const incidents = loadIncidents()
  const cutoff24h = Date.now() - 24 * 3600 * 1000

  const all = await Promise.all(conns.map(async conn => {
    const [nativeAlerts, definitions, thresholdAlerts] = await Promise.all([
      queryErp(conn, `
        SELECT
          ALERT_ID,
          ALERT_TIMESTAMP,
          ALERT_RATING,
          ALERT_DETAILS,
          ALERT_USERACTION,
          HOST,
          PORT,
          SERVICE_NAME
        FROM M_ALERTS
        ORDER BY ALERT_TIMESTAMP DESC
        LIMIT 200`),
      queryErp(conn, `
        SELECT
          ALERT_ID,
          ALERT_NAME,
          ALERT_DESCRIPTION,
          ALERT_CATEGORY,
          DEFAULT_THRESHOLD_WARNING_VALUE,
          DEFAULT_THRESHOLD_CRITICAL_VALUE,
          UNIT
        FROM M_ALERT_DEFINITIONS
        ORDER BY ALERT_CATEGORY, ALERT_NAME`),
      getThresholdAlerts(conn),
    ])
    const active = [...nativeAlerts, ...thresholdAlerts]

    const stats = getAlertStats(conn.id, 24)
    const actionableAlerts24h = incidents.filter(i => i.connectionId === conn.id && new Date(i.createdAt).getTime() >= cutoff24h).length
    const rawEvents24h = stats.rawSignals
    const noiseRatioPct = rawEvents24h <= 0
      ? 0
      : Number((Math.max(0, rawEvents24h - actionableAlerts24h) * 100 / rawEvents24h).toFixed(2))
    const correlationCompression = actionableAlerts24h <= 0
      ? 1
      : Number((rawEvents24h / actionableAlerts24h).toFixed(2))

    return {
      connId: conn.id,
      connName: conn.name,
      active,
      definitions,
      summary: {
        rawEvents24h,
        actionableAlerts24h,
        noiseRatioPct,
        correlationCompression,
        sampleCount24h: stats.sampleCount,
        avgActive24h: stats.avgActive,
      },
    }
  }))

  return NextResponse.json(all)
}
