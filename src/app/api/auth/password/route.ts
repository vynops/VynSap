import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, requireRole, signToken, verifyPassword } from '@/lib/auth'
import { appendAudit } from '@/lib/audit-store'
import { findUserById, saveUser } from '@/lib/user-store'

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const { currentPassword, newPassword } = await req.json()
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: 'Current password and a new password of at least 8 characters are required' }, { status: 400 })
  }
  const user = findUserById(auth.id)
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
  }
  saveUser({ ...user, passwordHash: hashPassword(newPassword), mustChangePassword: false })
  appendAudit({
    actor: auth.email,
    actorRole: auth.role,
    action: 'change_password',
    resource: 'account',
    resourceId: user.id,
    detail: 'Password changed',
    outcome: 'success',
  })
  const token = await signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: false,
  })
  const response = NextResponse.json({ ok: true })
  response.cookies.set('vs_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}