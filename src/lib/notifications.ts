import { loadSettings } from './settings-store'
import nodemailer from 'nodemailer'

export interface AlertPayload {
  title: string
  body: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  source: string
  url?: string
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
    text: `${emoji} *[${payload.severity.toUpperCase()}] ${payload.title}*`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${emoji} ${payload.title}`, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: payload.body } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `*Source:* ${payload.source} | *Time:* ${new Date().toISOString()}` }] },
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
  if (!settings.smtpHost || !settings.alertEmail) return
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass } : undefined,
    connectionTimeout: NOTIFICATION_TIMEOUT_MS,
    greetingTimeout: NOTIFICATION_TIMEOUT_MS,
    socketTimeout: NOTIFICATION_TIMEOUT_MS,
  })
  await transporter.sendMail({
    from: settings.smtpUser ?? 'vynsap@localhost',
    to: settings.alertEmail,
    subject: `[VynSAP ${payload.severity.toUpperCase()}] ${payload.title}`,
    text: `${payload.title}\n\n${payload.body}\n\nSource: ${payload.source}\nTime: ${new Date().toISOString()}`,
  })
}

export async function notify(payload: AlertPayload): Promise<void> {
  const deliveries = [
    ['slack', sendSlack(payload)],
    ['teams', sendTeams(payload)],
    ['email', sendEmail(payload)],
    ['webhook', sendCustomWebhook(payload)],
  ] as const
  const results = await Promise.allSettled(deliveries.map(([, delivery]) => delivery))
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.error(`[notifications] ${deliveries[index][0]} delivery failed:`, result.reason)
  })
}
