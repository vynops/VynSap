import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { deleteUser, findUserById, loadUsers, saveUser } from '@/lib/user-store'
import { hashPassword } from '@/lib/auth'
import { appendAudit } from '@/lib/audit-store'
import crypto from 'crypto'

const ROLES = ['admin', 'editor', 'viewer'] as const

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
    active: true,
  }
  saveUser(user)
  return NextResponse.json({ ...user, passwordHash: undefined }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { userId, password, role, active } = await req.json()
  if (typeof userId !== 'string') {
    return NextResponse.json({ error: 'A user is required' }, { status: 400 })
  }
  const user = findUserById(userId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'A password of at least 8 characters is required' }, { status: 400 })
    }
    saveUser({ ...user, passwordHash: hashPassword(password) })
    appendAudit({
      actor: auth.email,
      actorRole: auth.role,
      action: 'reset_password',
      resource: 'team_member',
      resourceId: user.id,
      detail: `Password reset for ${user.email}`,
      outcome: 'success',
    })
  }

  if (role !== undefined) {
    if (typeof role !== 'string' || !ROLES.includes(role as typeof ROLES[number])) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (user.role === 'admin' && role !== 'admin') {
      const remainingAdmins = loadUsers().filter(u => u.role === 'admin' && u.id !== user.id)
      if (remainingAdmins.length === 0) {
        return NextResponse.json({ error: 'Cannot remove the last remaining admin' }, { status: 400 })
      }
    }
    const previousRole = user.role
    saveUser({ ...user, role: role as typeof ROLES[number] })
    appendAudit({
      actor: auth.email,
      actorRole: auth.role,
      action: 'change_role',
      resource: 'team_member',
      resourceId: user.id,
      detail: `Role changed for ${user.email} from ${previousRole} to ${role}`,
      outcome: 'success',
    })
  }

  if (active !== undefined) {
    if (typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Invalid active flag' }, { status: 400 })
    }
    if (!active && user.id === auth.id) {
      return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
    }
    if (!active && user.role === 'admin') {
      const remainingActiveAdmins = loadUsers().filter(u => u.role === 'admin' && u.active !== false && u.id !== user.id)
      if (remainingActiveAdmins.length === 0) {
        return NextResponse.json({ error: 'Cannot deactivate the last remaining active admin' }, { status: 400 })
      }
    }
    saveUser({ ...user, active })
    appendAudit({
      actor: auth.email,
      actorRole: auth.role,
      action: active ? 'activate_user' : 'deactivate_user',
      resource: 'team_member',
      resourceId: user.id,
      detail: `${active ? 'Activated' : 'Deactivated'} ${user.email}`,
      outcome: 'success',
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { userId } = await req.json()
  if (typeof userId !== 'string') {
    return NextResponse.json({ error: 'A user is required' }, { status: 400 })
  }
  const user = findUserById(userId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (user.id === auth.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }
  if (user.role === 'admin') {
    const remainingAdmins = loadUsers().filter(u => u.role === 'admin' && u.id !== user.id)
    if (remainingAdmins.length === 0) {
      return NextResponse.json({ error: 'Cannot delete the last remaining admin' }, { status: 400 })
    }
  }
  deleteUser(user.id)
  appendAudit({
    actor: auth.email,
    actorRole: auth.role,
    action: 'delete_user',
    resource: 'team_member',
    resourceId: user.id,
    detail: `Deleted ${user.email}`,
    outcome: 'success',
  })
  return NextResponse.json({ ok: true })
}
