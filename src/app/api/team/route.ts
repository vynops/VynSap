import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadUsers, saveUser, deleteUser } from '@/lib/user-store'
import { hashPassword } from '@/lib/auth'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadUsers().map(u => ({ ...u, passwordHash: undefined })))
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const user = {
    id: `user-${crypto.randomUUID().slice(0, 8)}`,
    name: body.name,
    email: body.email,
    passwordHash: hashPassword(body.password ?? 'changeme'),
    role: body.role ?? 'viewer',
    createdAt: new Date().toISOString(),
  }
  saveUser(user)
  return NextResponse.json({ ...user, passwordHash: undefined }, { status: 201 })
}
