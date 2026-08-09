import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections, saveConnection, deleteConnection, encryptPassword } from '@/lib/connection-store'
import { removeFromPool } from '@/lib/erp-client'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const conn = loadConnections().find(c => c.id === id)
  if (!conn) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(conn)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const conns = loadConnections()
  const idx = conns.findIndex(c => c.id === id)
  if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const conn = { ...conns[idx], ...body }
  if (body.password) conn.passwordEnc = encryptPassword(body.password)
  removeFromPool(id)
  saveConnection(conn)
  return NextResponse.json(conn)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  removeFromPool(id)
  deleteConnection(id)
  return NextResponse.json({ ok: true })
}


