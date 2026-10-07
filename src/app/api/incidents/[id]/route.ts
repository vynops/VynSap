import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadIncidents, saveIncident, deleteIncident } from '@/lib/incident-store'
import { appendAudit } from '@/lib/audit-store'
import { pendingNotification } from '@/lib/notifications'

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
  const body = await req.json().catch(() => null)
  const editable = ['title', 'description', 'severity', 'status', 'connectionId', 'connectionName', 'assignee', 'tags', 'note']
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(field => !editable.includes(field)) ||
      (body.status !== undefined && !['open', 'investigating', 'resolved', 'closed'].includes(body.status)) ||
      (body.severity !== undefined && !['critical', 'high', 'medium', 'low'].includes(body.severity)) ||
      ['title', 'description', 'connectionId', 'connectionName', 'assignee', 'note'].some(field => body[field] !== undefined && typeof body[field] !== 'string') ||
      (body.title !== undefined && !body.title.trim()) ||
      (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag: unknown) => typeof tag !== 'string')))) {
    return NextResponse.json({ error: 'Invalid or protected incident fields' }, { status: 400 })
  }
  const nowIso = new Date().toISOString()
  const prev = incs[idx]
  const { note, ...changes } = body
  const updated = { ...prev, ...changes, updatedAt: nowIso }

  if (prev.status !== body.status && body.status) {
    updated.notification = pendingNotification()
    updated.timeline = [...(updated.timeline ?? []), {
      at: nowIso,
      by: auth.name,
      note: `Status changed from ${prev.status} to ${body.status}`,
    }]
  }

  if ((body.status === 'resolved' || body.status === 'closed') && !updated.resolvedAt) {
    updated.resolvedAt = nowIso
  }

  if (body.status && body.status !== 'resolved' && body.status !== 'closed') {
    updated.resolvedAt = undefined
  }

  const changedFields = Object.keys(changes).filter(field => field !== 'status')
  if (changedFields.length) {
    updated.timeline = [...updated.timeline, { at: nowIso, by: auth.name, note: `Updated fields: ${changedFields.join(', ')}` }]
  }
  if (note) {
    updated.timeline = [...(updated.timeline ?? []), {
      at: nowIso,
      by: auth.name,
      note,
    }]
  }
  saveIncident(updated)
  appendAudit({ actor: auth.name, actorRole: auth.role, action: 'update_incident', resource: 'incident', resourceId: id, detail: `Fields: ${Object.keys(changes).join(', ')}; status: ${prev.status} -> ${updated.status}`, outcome: 'success' })
  if (note) appendAudit({ actor: auth.name, actorRole: auth.role, action: 'add_note', resource: 'incident', resourceId: id, outcome: 'success' })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const incident = loadIncidents().find(item => item.id === id)
  if (!incident) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (incident.status !== 'resolved' && incident.status !== 'closed') return NextResponse.json({ error: 'Resolve or close the incident before deleting it' }, { status: 409 })
  deleteIncident(id)
  appendAudit({ actor: auth.name, actorRole: auth.role, action: 'delete_incident', resource: 'incident', resourceId: id, outcome: 'success' })
  return NextResponse.json({ ok: true })
}
