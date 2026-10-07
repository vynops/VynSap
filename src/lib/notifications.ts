import { loadSettings } from './settings-store'
import nodemailer from 'nodemailer'
import { appendAudit } from './audit-store'
import { randomUUID } from 'node:crypto'

export interface AlertPayload {
  title: string
  body: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  source: string
  url?: string
  resourceId?: string
  recipientEmail?: string
}

export interface NotificationState {
  id?: string
  status: 'pending' | 'accepted' | 'failed' | 'skipped'
  attempts: number
  acceptedChannels: string[]
  lastAttemptAt?: string
  nextAttemptAt?: string
}

export function pendingNotification(): NotificationState {
  return { id: randomUUID(), status: 'pending', attempts: 0, acceptedChannels: [] }
}

export class NotificationDeliveryError extends Error {
  constructor(public readonly acceptedChannels: string[], failedCount: number) {
    super(`Notification delivery failed on ${failedCount} configured channel(s)`)
  }
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️',
}
const NOTIFICATION_TIMEOUT_MS = 10000

export async function sendSlack(payload: AlertPayload): Promise<void> {
  const settings = loadSettings()
  const url = settings.slackWebhook
  if (!url) return
  const emoji = SEVERITY_EMOJI[payload.severity] ?? '•'
  const body = JSON.stringify({
    text: `${emoji} *[${payload.severity.toUpperCase()}] ${payload.title}*`.slice(0, 4000),
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: Array.from(`${emoji} ${payload.title || 'Alert'}`).slice(0, 150).join(''), emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: Array.from(payload.body || payload.title || 'Alert').slice(0, 3000).join('') } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `*Source:* ${payload.source.slice(0, 500)} | *Time:* ${new Date().toISOString()}` }] },
    ],
  })
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Slack webhook returned HTTP ${response.status}`)
}

export async function sendTeams(payload: AlertPayload): Promise<void> {
  const settings = loadSettings()
  const url = settings.teamsWebhook
  if (!url) return
  const emoji = SEVERITY_EMOJI[payload.severity] ?? '•'
  const body = JSON.stringify({
    '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
    summary: payload.title, themeColor: payload.severity === 'critical' ? 'FF0000' : payload.severity === 'high' ? 'FF8C00' : '0078D7',
    sections: [{ activityTitle: `${emoji} ${payload.title}`, activityText: payload.body, facts: [{ name: 'Severity', value: payload.severity }, { name: 'Source', value: payload.source }, { name: 'Time', value: new Date().toISOString() }] }],
  })
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Teams webhook returned HTTP ${response.status}`)
}

export async function sendCustomWebhook(payload: AlertPayload): Promise<void> {
  const settings = loadSettings()
  const url = settings.customWebhook
  if (!url) return
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VynSAP-Event': 'alert' },
    body: JSON.stringify({
      event: 'vynsap.alert',
      source: payload.source,
      timestamp: new Date().toISOString(),
      payload,
    }),
    signal: AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Custom webhook returned HTTP ${response.status}`)
}

export async function sendEmail(payload: AlertPayload): Promise<void> {
  const settings = loadSettings()
  const recipient = payload.recipientEmail ?? settings.alertEmail
  if (!settings.smtpHost || !recipient) return
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    secure: settings.smtpPort === 465,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass } : undefined,
    connectionTimeout: NOTIFICATION_TIMEOUT_MS,
    greetingTimeout: NOTIFICATION_TIMEOUT_MS,
    socketTimeout: NOTIFICATION_TIMEOUT_MS,
  })
  const result = await transporter.sendMail({
    from: settings.smtpUser ?? 'vynsap@localhost',
    to: recipient,
    subject: `[VynSAP ${payload.severity.toUpperCase()}] ${payload.title}`,
    text: `${payload.title}\n\n${payload.body}\n\nSource: ${payload.source}\nTime: ${new Date().toISOString()}`,
  })
  if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP recipient was not accepted')
}

export async function notify(payload: AlertPayload, acceptedChannels: string[] = []): Promise<string[]> {
  const settings = loadSettings()
  const deliveries = [
    ['slack', !!settings.slackWebhook, () => sendSlack(payload)],
    ['teams', !!settings.teamsWebhook, () => sendTeams(payload)],
    ['email', !!(settings.smtpHost && (payload.recipientEmail ?? settings.alertEmail)), () => sendEmail(payload)],
    ['webhook', !!settings.customWebhook, () => sendCustomWebhook(payload)],
  ] as const
  const configured = deliveries.filter(([channel, enabled]) => enabled && !acceptedChannels.includes(channel))
  const results = await Promise.allSettled(configured.map(([, , delivery]) => delivery()))
  results.forEach((result, index) => {
    appendAudit({
      actor: 'notifier', actorRole: 'system', action: 'notification_delivery',
      resource: 'notification', resourceId: payload.resourceId ?? configured[index][0],
      detail: JSON.stringify({ channel: configured[index][0], severity: payload.severity, status: result.status === 'fulfilled' ? 'accepted' : 'failed' }),
      outcome: result.status === 'fulfilled' ? 'success' : 'failure',
    })
  })
  const accepted = [...acceptedChannels, ...configured.filter((_, index) => results[index].status === 'fulfilled').map(([channel]) => channel)]
  const failed = results.filter(result => result.status === 'rejected').length
  if (failed) throw new NotificationDeliveryError(accepted, failed)
  return accepted
}
