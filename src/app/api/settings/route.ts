import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadSettings, mergeSettings } from '@/lib/settings-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const s = loadSettings()
  // Redact sensitive fields
  const safe = { ...s, smtpPass: s.smtpPass ? '***configured***' : '', aiApiKey: s.aiApiKey || s.groqApiKey ? '***configured***' : '', groqApiKey: s.groqApiKey ? '***configured***' : '' }
  return NextResponse.json(safe)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  // Don't overwrite masked values
  if (body.smtpPass === '***' || body.smtpPass === '***configured***') delete body.smtpPass
  if (body.aiApiKey === '***' || body.aiApiKey === '***configured***') delete body.aiApiKey
  if (body.groqApiKey === '***' || body.groqApiKey === '***configured***') delete body.groqApiKey
  mergeSettings(body)
  return NextResponse.json({ ok: true })
}
