import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { loadIncidents } from '@/lib/incident-store'
import { appendAlertSnapshots, getAlertStats } from '@/lib/telemetry-store'
import { notify } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const conns = loadConnections().filter(c => !connId || c.id === connId)
  const incidents = loadIncidents()
  const cutoff24h = Date.now() - 24 * 3600 * 1000

  const all = await Promise.all(conns.map(async conn => {
    const [active, definitions] = await Promise.all([
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
    ])
    const criticalCount = active.filter(a => Number(a.ALERT_RATING ?? 0) >= 5).length
    const warningCount = active.filter(a => Number(a.ALERT_RATING ?? 0) >= 3 && Number(a.ALERT_RATING ?? 0) < 5).length

    appendAlertSnapshots([{
      connId: conn.id,
      activeCount: active.length,
      criticalCount,
      warningCount,
      at: new Date().toISOString(),
    }])

    // Fire Slack for new critical alerts (rating ≥ 5)
    if (criticalCount > 0) {
      const criticalOnes = active.filter(a => Number(a.ALERT_RATING ?? 0) >= 5).slice(0, 3)
      void notify({
        title: `${criticalCount} critical alert(s) on ${conn.name}`,
        body: criticalOnes.map(a => `• ${String(a.ALERT_DETAILS ?? a.ALERT_ID)}`).join('\n'),
        severity: 'critical',
        source: `VynSAP / ${conn.name}`,
      })
    }

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
