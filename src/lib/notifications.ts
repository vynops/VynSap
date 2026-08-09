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
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
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
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
}

export async function sendEmail(payload: AlertPayload): Promise<void> {
  const settings = loadSettings()
  if (!settings.smtpHost || !settings.alertEmail) return
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass } : undefined,
  })
  await transporter.sendMail({
    from: settings.smtpUser ?? 'vynsap@localhost',
    to: settings.alertEmail,
    subject: `[VynSAP ${payload.severity.toUpperCase()}] ${payload.title}`,
    text: `${payload.title}\n\n${payload.body}\n\nSource: ${payload.source}\nTime: ${new Date().toISOString()}`,
  })
}

export async function notify(payload: AlertPayload): Promise<void> {
  await Promise.allSettled([sendSlack(payload), sendTeams(payload)])
}
