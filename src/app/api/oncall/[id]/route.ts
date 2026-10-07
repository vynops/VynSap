import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  loadSchedules,
  saveSchedule,
  deleteSchedule,
  rotateOnCall,
  addEscalation,
  validScheduleFields,
} from '@/lib/oncall-store'
import { loadIncidents, saveIncident } from '@/lib/incident-store'
import { appendAudit } from '@/lib/audit-store'
import { pendingNotification } from '@/lib/notifications'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  if (body.action === 'rotate') {
    const updated = rotateOnCall(id)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    appendAudit({ actor: auth.name, actorRole: auth.role, action: 'rotate_schedule', resource: 'oncall-schedule', resourceId: id, outcome: 'success' })
    return NextResponse.json(updated)
  }

  if (body.action === 'escalate') {
    const schedules = loadSchedules()
    const schedule = schedules.find(s => s.id === id)
    if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const incidentId = String(body.incidentId ?? '')
    const incident = incidentId ? loadIncidents().find(i => i.id === incidentId) : undefined
    if (incidentId && !incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })

    const member = schedule.escalation?.[0] ?? schedule.members.find(m => m.id === schedule.currentOnCall)
    if (!member) return NextResponse.json({ error: 'No escalation target available' }, { status: 400 })

    const esc = addEscalation({
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      incidentId: incident?.id,
      incidentTitle: incident?.title,
      escalatedTo: `${member.name} <${member.email}>`,
      reason: String(body.reason ?? 'Manual escalation'),
      recipientEmail: member.email,
      notification: pendingNotification(),
    })
    if (incident) {
      incident.timeline.push({ at: esc.at, by: auth.name, note: `Escalated via schedule ${schedule.id}; event ${esc.id}` })
      incident.updatedAt = esc.at
      saveIncident(incident)
    }
    appendAudit({ actor: auth.name, actorRole: auth.role, action: 'escalate_schedule', resource: 'oncall-escalation', resourceId: esc.id, detail: `Schedule: ${id}; incident: ${incidentId || 'none'}`, outcome: 'success' })
    return NextResponse.json(esc)
  }

  if (!body || Object.keys(body).some(field => !['name', 'rotation', 'members', 'escalation', 'currentOnCall'].includes(field))) return NextResponse.json({ error: 'Invalid or protected schedule fields' }, { status: 400 })

  const schedules = loadSchedules()
  const idx = schedules.findIndex(s => s.id === id)
  if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = {
    ...schedules[idx],
    ...body,
    updatedAt: new Date().toISOString(),
  }
  if (!validScheduleFields(updated)) return NextResponse.json({ error: 'Invalid schedule fields' }, { status: 400 })
  saveSchedule(updated)
  appendAudit({ actor: auth.name, actorRole: auth.role, action: 'update_schedule', resource: 'oncall-schedule', resourceId: id, outcome: 'success' })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params
  if (!loadSchedules().some(schedule => schedule.id === id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  deleteSchedule(id)
  appendAudit({ actor: auth.name, actorRole: auth.role, action: 'delete_schedule', resource: 'oncall-schedule', resourceId: id, outcome: 'success' })
  return NextResponse.json({ ok: true })
}
