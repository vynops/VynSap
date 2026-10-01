import { NextRequest, NextResponse } from 'next/server'
import { signToken } from '@/lib/auth'
import { findUserByEmail, ensureAdminUser } from '@/lib/user-store'
import { verifyPassword } from '@/lib/auth'
import { clearLoginFailures, loginAllowed, recordLoginFailure } from '@/lib/login-rate-limit'

export async function POST(req: NextRequest) {
  ensureAdminUser()
  const { email, password } = await req.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }
  const key = `${req.headers.get('x-forwarded-for') ?? 'unknown'}:${String(email).toLowerCase()}`
  if (!loginAllowed(key)) {
    return NextResponse.json({ error: 'Too many login attempts. Try again later.' }, { status: 429 })
  }
  const user = findUserByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    recordLoginFailure(key)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  if (user.active === false) {
    recordLoginFailure(key)
    return NextResponse.json({ error: 'This account has been deactivated' }, { status: 403 })
  }
  clearLoginFailures(key)
  const token = await signToken({ id: user.id, name: user.name, email: user.email, role: user.role })
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  res.cookies.set('vs_token', token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 8,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
