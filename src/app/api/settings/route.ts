import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadSettings, mergeSettings } from '@/lib/settings-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const s = loadSettings()
  // Redact sensitive fields
  const safe = { ...s, smtpPass: s.smtpPass ? '***' : '', groqApiKey: s.groqApiKey ? '***' : '' }
  return NextResponse.json(safe)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  // Don't overwrite masked values
  if (body.smtpPass === '***') delete body.smtpPass
  if (body.groqApiKey === '***') delete body.groqApiKey
  mergeSettings(body)
  return NextResponse.json({ ok: true })
}
