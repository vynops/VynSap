import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import Groq from 'groq-sdk'
import { requireRole } from '@/lib/auth'
import { loadSettings, type AppSettings } from '@/lib/settings-store'

type TestKind = 'groq' | 'email' | 'slack' | 'teams'

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

async function postWebhook(url: string, channel: 'Slack' | 'Teams') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const payload = {
      text: `[VynSAP] ${channel} test notification at ${new Date().toISOString()}`,
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${channel} webhook returned ${res.status}${body ? `: ${body.slice(0, 140)}` : ''}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function testGroq(settings: Partial<AppSettings>) {
  const apiKey = String(settings.groqApiKey ?? '').trim() || process.env.GROQ_API_KEY
  const model = String(settings.aiModel ?? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile').trim()
  if (!apiKey || apiKey === '***') {
    return NextResponse.json({ ok: false, message: 'Groq API key is not configured.' }, { status: 400 })
  }

  const client = new Groq({ apiKey })
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: 'Reply with: VynSAP Groq test OK' }],
    max_tokens: 24,
    temperature: 0,
  })
  const reply = completion.choices[0]?.message?.content ?? 'No response'
  return NextResponse.json({ ok: true, message: `Groq connected successfully with ${model}. Reply: ${reply}` })
}

async function testEmail(settings: Partial<AppSettings>) {
  const host = String(settings.smtpHost ?? '').trim()
  const port = asNumber(settings.smtpPort, 587)
  const user = String(settings.smtpUser ?? '').trim()
  const passRaw = String(settings.smtpPass ?? '').trim()
  const pass = passRaw === '***' ? '' : passRaw
  const to = String(settings.alertEmail ?? user).trim()

  if (!host) return NextResponse.json({ ok: false, message: 'SMTP host is required.' }, { status: 400 })
  if (!to) return NextResponse.json({ ok: false, message: 'Alert Email or SMTP user is required.' }, { status: 400 })

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  })

  await transporter.verify()
  const info = await transporter.sendMail({
    from: user || 'vynsap@localhost',
    to,
    subject: 'VynSAP SMTP test',
    text: `VynSAP SMTP test successful at ${new Date().toISOString()}`,
  })

  return NextResponse.json({ ok: true, message: `Email sent successfully to ${to}. Message ID: ${info.messageId}` })
}

async function testSlack(settings: Partial<AppSettings>) {
  const webhook = String(settings.slackWebhook ?? '').trim()
  if (!webhook) return NextResponse.json({ ok: false, message: 'Slack webhook URL is required.' }, { status: 400 })
  await postWebhook(webhook, 'Slack')
  return NextResponse.json({ ok: true, message: 'Slack webhook test delivered successfully.' })
}

async function testTeams(settings: Partial<AppSettings>) {
  const webhook = String(settings.teamsWebhook ?? '').trim()
  if (!webhook) return NextResponse.json({ ok: false, message: 'Teams webhook URL is required.' }, { status: 400 })
  await postWebhook(webhook, 'Teams')
  return NextResponse.json({ ok: true, message: 'Teams webhook test delivered successfully.' })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const kind = String(body?.kind ?? '') as TestKind
    const incoming = { ...(body?.settings ?? {}) } as Partial<AppSettings>
    if (incoming.smtpPass === '***') delete incoming.smtpPass
    if (incoming.groqApiKey === '***') delete incoming.groqApiKey
    const merged = { ...loadSettings(), ...incoming }

    if (kind === 'groq') return await testGroq(merged)
    if (kind === 'email') return await testEmail(merged)
    if (kind === 'slack') return await testSlack(merged)
    if (kind === 'teams') return await testTeams(merged)

    return NextResponse.json({ ok: false, message: 'Invalid test kind.' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Test failed: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
