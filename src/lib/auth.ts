import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { findUserById } from './user-store'
import { getRuntimeSecrets } from './runtime-secrets'

function secret(): Uint8Array {
  return new TextEncoder().encode(getRuntimeSecrets().jwtSecret)
}

export type UserRole = 'admin' | 'editor' | 'viewer'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  mustChangePassword?: boolean
}

const ROLE_RANK: Record<UserRole, number> = { admin: 3, editor: 2, viewer: 1 }

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret())
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

export async function getSession(req: NextRequest): Promise<SessionUser | null> {
  const cookie = req.cookies.get('vs_token')?.value
  if (!cookie) return null
  return verifyToken(cookie)
}

export async function requireRole(
  req: NextRequest,
  minRole: UserRole
): Promise<SessionUser | NextResponse> {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const currentUser = findUserById(session.id)
  if (!currentUser || currentUser.active === false) {
    return NextResponse.json({ error: 'This account has been deactivated' }, { status: 403 })
  }
  const allowedDuringPasswordChange = ['/api/auth/password', '/api/auth/me']
  if (currentUser.mustChangePassword && !allowedDuringPasswordChange.includes(new URL(req.url).pathname)) {
    return NextResponse.json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403 })
  }
  if (!ROLE_RANK[currentUser.role] || ROLE_RANK[currentUser.role] < ROLE_RANK[minRole]) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return {
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    mustChangePassword: Boolean(currentUser.mustChangePassword),
  }
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(plain, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const attempt = crypto.scryptSync(plain, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'))
}
