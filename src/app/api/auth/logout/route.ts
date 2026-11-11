import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { appendAudit } from '@/lib/audit-store'

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (session) {
    appendAudit({
      actor: session.email,
      actorRole: session.role,
      action: 'logout',
      resource: 'user-session',
      resourceId: session.id,
      outcome: 'success',
    })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('vs_token', '', { maxAge: 0, path: '/' })
  return res
}
