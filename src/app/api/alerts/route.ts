import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { createIncident, loadIncidents, saveIncident } from '@/lib/incident-store'
import { appendAlertSnapshots, getAlertStats } from '@/lib/telemetry-store'
import { recordAlertSignals } from '@/lib/apm-store'
import { appendAudit } from '@/lib/audit-store'
import { notify } from '@/lib/notifications'
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
    const criticalCount = active.filter(a => Number(a.ALERT_RATING ?? 0) >= 5).length
    const warningCount = active.filter(a => Number(a.ALERT_RATING ?? 0) >= 3 && Number(a.ALERT_RATING ?? 0) < 5).length

    appendAlertSnapshots([{
      connId: conn.id,
      activeCount: active.length,
      criticalCount,
      warningCount,
      at: new Date().toISOString(),
    }])

    const now = new Date().toISOString()
    const signals = active.map(alert => {
      const message = String(alert.ALERT_DETAILS ?? alert.ALERT_ID)
      return {
        fingerprint: `${conn.id}:${String(alert.ALERT_ID)}:${message.slice(0, 120)}`,
        connectionId: conn.id,
        connectionName: conn.name,
        severity: Number(alert.ALERT_RATING ?? 0) >= 5 ? 'critical' as const : Number(alert.ALERT_RATING ?? 0) >= 3 ? 'high' as const : 'medium' as const,
        message,
        source: 'database-alert',
        firstSeen: now,
        lastSeen: now,
        status: 'firing' as const,
      }
    })
    recordAlertSignals(signals)

    const incidentsNow = loadIncidents()
    for (const signal of signals.filter(item => item.severity === 'critical')) {
      const alreadyOpen = incidentsNow.some(incident => incident.fingerprint === signal.fingerprint && incident.status !== 'resolved' && incident.status !== 'closed')
      if (alreadyOpen) continue
      const incident = createIncident({
        title: `[Alert] ${signal.message.slice(0, 100)}`,
        description: signal.message,
        severity: 'critical',
        status: 'open',
        connectionId: signal.connectionId,
        connectionName: signal.connectionName,
        tags: ['alert', 'correlated'],
        fingerprint: signal.fingerprint,
        source: 'alert',
        evidence: { alertFingerprint: signal.fingerprint, message: signal.message, capturedAt: now },
      })
      saveIncident(incident)
      appendAudit({ actor: 'alert-engine', actorRole: 'system', action: 'create_incident', resource: 'incident', resourceId: incident.id, detail: signal.message, outcome: 'success' })
    }

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
