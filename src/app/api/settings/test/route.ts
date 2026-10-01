import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { requireRole } from '@/lib/auth'
import { loadSettings, type AppSettings } from '@/lib/settings-store'

type TestKind = 'groq' | 'openai' | 'anthropic' | 'google' | 'custom' | 'email' | 'slack' | 'teams' | 'webhook'

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

async function testAi(settings: Partial<AppSettings>, provider: string) {
  const apiKey = String(settings.aiApiKey ?? (provider === 'groq' ? settings.groqApiKey : '') ?? '').trim() || (provider === 'groq' ? process.env.GROQ_API_KEY : '')
  const model = String(settings.aiModel ?? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile').trim()
  if (!apiKey || apiKey === '***' || apiKey === '***configured***') return NextResponse.json({ ok: false, message: `${provider} API key is not configured.` }, { status: 400 })
  const prompt = 'Reply with: VynSAP AI test OK'
  let response: Response
  if (provider === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: 24, messages: [{ role: 'user', content: prompt }] }) })
  } else if (provider === 'google') {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) })
  } else {
    const baseUrl = provider === 'custom'
      ? String(settings.aiBaseUrl ?? '').trim()
      : provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : 'https://api.openai.com/v1'
    if (!baseUrl) return NextResponse.json({ ok: false, message: 'Custom AI provider requires a base URL.' }, { status: 400 })
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 24, temperature: 0 }) })
  }
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(`${provider} API returned 401: API key is invalid, expired, or revoked. Replace the key in Settings and save it again.`)
    }
    throw new Error(`${provider} API returned ${response.status}`)
  }
  return NextResponse.json({ ok: true, message: `${provider} connected successfully with ${model}.` })
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

async function testWebhook(settings: Partial<AppSettings>) {
  const webhook = String(settings.customWebhook ?? '').trim()
  if (!webhook) return NextResponse.json({ ok: false, message: 'Custom webhook URL is required.' }, { status: 400 })
  let parsed: URL
  try {
    parsed = new URL(webhook)
  } catch {
    return NextResponse.json({ ok: false, message: 'Custom webhook URL is invalid.' }, { status: 400 })
  }
  if (parsed.protocol !== 'https:') return NextResponse.json({ ok: false, message: 'Custom webhook URL must use HTTPS.' }, { status: 400 })
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VynSAP-Event': 'test' },
    body: JSON.stringify({ event: 'vynsap.test', source: 'VynSAP Settings', timestamp: new Date().toISOString(), payload: { message: 'VynSAP custom webhook test', severity: 'info' } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`Custom webhook returned HTTP ${response.status}`)
  return NextResponse.json({ ok: true, message: 'Custom webhook test delivered successfully.' })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const kind = String(body?.kind ?? '') as TestKind
    const incoming = { ...(body?.settings ?? {}) } as Partial<AppSettings>
    if (incoming.smtpPass === '***' || incoming.smtpPass === '***configured***') delete incoming.smtpPass
    if (incoming.aiApiKey === '***' || incoming.aiApiKey === '***configured***') delete incoming.aiApiKey
    if (incoming.groqApiKey === '***' || incoming.groqApiKey === '***configured***') delete incoming.groqApiKey
    const merged = { ...loadSettings(), ...incoming }

    if (['groq', 'openai', 'anthropic', 'google', 'custom'].includes(kind)) return await testAi(merged, kind)
    if (kind === 'email') return await testEmail(merged)
    if (kind === 'slack') return await testSlack(merged)
    if (kind === 'teams') return await testTeams(merged)
    if (kind === 'webhook') return await testWebhook(merged)

    return NextResponse.json({ ok: false, message: 'Invalid test kind.' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Test failed: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
