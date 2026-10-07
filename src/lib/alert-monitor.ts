import path from 'path'
import { writeFileSync } from 'atomically'
import { loadConnections, isDemoConnection, type ErpConnection } from './connection-store'
import { queryErp } from './erp-client'
import { getThresholdAlerts } from './threshold-alerts'
import { createIncident, loadIncidents, saveIncident } from './incident-store'
import { appendAudit } from './audit-store'
import { recordAlertSignals } from './apm-store'
import { appendAlertSnapshots } from './telemetry-store'
import { notify, NotificationDeliveryError, pendingNotification, type AlertPayload, type NotificationState } from './notifications'
import { loadEscalations, saveEscalation } from './oncall-store'

interface AlertRow { ALERT_ID?: unknown; ALERT_DETAILS?: unknown; ALERT_RATING?: unknown }

export async function processAlerts(conn: ErpConnection, alerts: AlertRow[], completeSample = true) {
  const now = new Date().toISOString()
  const signals = alerts.filter(alert => Number(alert.ALERT_RATING) >= 3).map(alert => ({
    fingerprint: `${conn.id}:${String(alert.ALERT_ID)}`,
    connectionId: conn.id, connectionName: conn.name,
    severity: Number(alert.ALERT_RATING) >= 5 ? 'critical' as const : 'high' as const,
    message: String(alert.ALERT_DETAILS ?? alert.ALERT_ID),
    source: 'database-alert', firstSeen: now, lastSeen: now, status: 'firing' as const,
  }))
  recordAlertSignals(signals, completeSample ? conn.id : undefined)
  appendAlertSnapshots([{ connId: conn.id, activeCount: alerts.length, criticalCount: signals.filter(signal => signal.severity === 'critical').length, warningCount: signals.filter(signal => signal.severity === 'high').length, at: now }])

  const existing = loadIncidents().filter(incident => incident.connectionId === conn.id && incident.source === 'alert')
  for (const incident of existing) {
    if (completeSample && incident.evidence?.alertActive && !signals.some(signal => incident.fingerprint === signal.fingerprint || incident.fingerprint?.startsWith(`${signal.fingerprint}:`))) {
      incident.evidence.alertActive = false
      incident.updatedAt = now
      incident.timeline.push({ at: now, by: 'alert-engine', note: 'Alert cleared; incident remains available for review and resolution' })
      saveIncident(incident)
      appendAudit({ actor: 'alert-engine', actorRole: 'system', action: 'update_incident', resource: 'incident', resourceId: incident.id, detail: 'Alert cleared', outcome: 'success' })
    }
  }
  for (const signal of signals) {
    let incident = [...existing].reverse().find(item => item.fingerprint === signal.fingerprint || item.fingerprint?.startsWith(`${signal.fingerprint}:`))
    if (incident && (incident.status === 'resolved' || incident.status === 'closed') && incident.evidence?.alertActive === false) incident = undefined
    if (!incident) {
      incident = createIncident({
        title: `[Alert] ${signal.message.slice(0, 100)}`, description: signal.message,
        severity: signal.severity, status: 'open', connectionId: conn.id, connectionName: conn.name,
        tags: ['alert', 'correlated'], fingerprint: signal.fingerprint, source: 'alert',
        evidence: { alertFingerprint: signal.fingerprint, message: signal.message, capturedAt: now, alertActive: true },
        notification: pendingNotification(),
      })
      saveIncident(incident)
      existing.push(incident)
      appendAudit({ actor: 'alert-engine', actorRole: 'system', action: 'create_incident', resource: 'incident', resourceId: incident.id, outcome: 'success' })
    }
    if (incident.status === 'resolved' || incident.status === 'closed') continue
    incident.fingerprint = signal.fingerprint
    if (signal.severity === 'critical' && incident.severity !== 'critical') {
      incident.severity = 'critical'
      incident.notification = pendingNotification()
      incident.updatedAt = now
      incident.timeline.push({ at: now, by: 'alert-engine', note: 'Alert severity escalated to critical' })
      appendAudit({ actor: 'alert-engine', actorRole: 'system', action: 'update_incident', resource: 'incident', resourceId: incident.id, detail: 'Severity escalated to critical', outcome: 'success' })
    }
    incident.evidence = { ...incident.evidence, alertActive: true }
    incident.notification ??= pendingNotification()
    saveIncident(incident)
  }
  await deliverPendingNotifications()
}

async function attemptDelivery(delivery: NotificationState, payload: AlertPayload, persist: (completed: boolean) => boolean) {
  if (delivery.status === 'accepted' || delivery.attempts >= 3 || (delivery.nextAttemptAt && Date.parse(delivery.nextAttemptAt) > Date.now())) return
  delivery.attempts += 1
  delivery.lastAttemptAt = new Date().toISOString()
  delivery.nextAttemptAt = new Date(Date.now() + 60000 * 2 ** (delivery.attempts - 1)).toISOString()
  if (!persist(false)) return
  try {
    delivery.acceptedChannels = await notify(payload, delivery.acceptedChannels)
    delivery.status = delivery.acceptedChannels.length ? 'accepted' : 'skipped'
    if (delivery.status === 'skipped') delivery.attempts -= 1
  } catch (error) {
    if (!(error instanceof NotificationDeliveryError)) throw error
    delivery.acceptedChannels = error.acceptedChannels
    delivery.status = 'failed'
  }
  persist(true)
  if (delivery.status === 'skipped') appendAudit({ actor: 'notifier', actorRole: 'system', action: 'notification_delivery', resource: 'notification', resourceId: payload.resourceId, detail: 'Skipped: no notification channel configured', outcome: 'failure' })
}

export async function deliverPendingNotifications() {
  for (const incident of loadIncidents().filter(item => item.notification)) {
    const delivery = incident.notification!
    await attemptDelivery(delivery, { title: `[${incident.status.toUpperCase()}] ${incident.title}`, body: incident.description, severity: incident.severity, source: 'VynSAP incident monitor', resourceId: incident.id }, completed => {
      const latest = loadIncidents().find(item => item.id === incident.id)
      if (!latest || latest.status !== incident.status || latest.notification?.id !== delivery.id) return false
      latest.notification = delivery
      if (completed) latest.timeline.push({ at: new Date().toISOString(), by: 'notifier', note: `Notification ${delivery.status}; attempt ${delivery.attempts}` })
      saveIncident(latest)
      return true
    })
  }
  for (const escalation of loadEscalations().filter(item => item.notification && !item.resolved)) {
    const delivery = escalation.notification!
    await attemptDelivery(delivery, { title: `On-call escalation: ${escalation.incidentTitle ?? escalation.scheduleName ?? 'Incident'}`, body: escalation.reason, severity: 'high', source: 'VynSAP on-call', resourceId: escalation.id, recipientEmail: escalation.recipientEmail }, () => {
      const latest = loadEscalations().find(item => item.id === escalation.id)
      if (!latest || latest.resolved || latest.notification?.id !== delivery.id) return false
      saveEscalation({ ...latest, notification: delivery })
      return true
    })
  }
}

async function collectAlerts(conn: ErpConnection): Promise<AlertRow[]> {
  const [nativeAlerts, thresholdAlerts] = await Promise.all([
    queryErp(conn, 'SELECT ALERT_ID, ALERT_TIMESTAMP, ALERT_RATING, ALERT_DETAILS FROM M_ALERTS ORDER BY ALERT_TIMESTAMP DESC LIMIT 200', undefined, { throwOnError: true }),
    getThresholdAlerts(conn, { throwOnError: true }),
  ])
  return [...nativeAlerts, ...thresholdAlerts]
}

export async function runAlertMonitor(collect: (conn: ErpConnection) => Promise<AlertRow[]> = collectAlerts) {
  const startedAt = new Date().toISOString()
  const conns = loadConnections().filter(conn => !isDemoConnection(conn))
  let failedConnections = 0
  for (const conn of conns) {
    let alerts: AlertRow[]
    let completeSample = true
    try {
      alerts = await collect(conn)
    } catch {
      failedConnections += 1
      completeSample = false
      alerts = [{ ALERT_ID: 'monitor-unavailable', ALERT_RATING: 5, ALERT_DETAILS: 'Monitoring data could not be retrieved. Check the configured data source.' }]
    }
    await processAlerts(conn, alerts, completeSample)
  }
  await deliverPendingNotifications()
  const status = { startedAt, completedAt: new Date().toISOString(), state: failedConnections ? 'degraded' : conns.length ? 'healthy' : 'no-data-sources', connections: conns.length, failedConnections }
  const file = path.join(process.cwd(), 'data', 'monitor-status.json')
  writeFileSync(file, JSON.stringify(status, null, 2))
  return status
}