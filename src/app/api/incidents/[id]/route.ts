import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadIncidents, saveIncident, deleteIncident } from '@/lib/incident-store'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const inc = loadIncidents().find(i => i.id === id)
  if (!inc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(inc)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const incs = loadIncidents()
  const idx = incs.findIndex(i => i.id === id)
  if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const nowIso = new Date().toISOString()
  const prev = incs[idx]
  const updated = { ...prev, ...body, updatedAt: nowIso }

  if (prev.status !== body.status && body.status) {
    updated.timeline = [...(updated.timeline ?? []), {
      at: nowIso,
      by: (auth as { name?: string }).name ?? 'user',
      note: `Status changed from ${prev.status} to ${body.status}`,
    }]
  }

  if ((body.status === 'resolved' || body.status === 'closed') && !updated.resolvedAt) {
    updated.resolvedAt = nowIso
  }

  if (body.status && body.status !== 'resolved' && body.status !== 'closed') {
    updated.resolvedAt = undefined
  }

  if (body.note) {
    updated.timeline = [...(updated.timeline ?? []), {
      at: nowIso,
      by: (auth as { name?: string }).name ?? 'user',
      note: body.note,
    }]
  }
  saveIncident(updated)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  deleteIncident(id)
  return NextResponse.json({ ok: true })
}
