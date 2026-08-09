import { NextRequest, NextResponse } from 'next/server'
import { signToken } from '@/lib/auth'
import { findUserByEmail, ensureAdminUser } from '@/lib/user-store'
import { verifyPassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  ensureAdminUser()
  const { email, password } = await req.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }
  const user = findUserByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  const token = await signToken({ id: user.id, name: user.name, email: user.email, role: user.role })
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  res.cookies.set('vs_token', token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 8,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
