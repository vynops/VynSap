import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  loadSchedules,
  saveSchedule,
  deleteSchedule,
  rotateOnCall,
  addEscalation,
} from '@/lib/oncall-store'
import { loadIncidents } from '@/lib/incident-store'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params
  const body = await req.json()

  if (body.action === 'rotate') {
    const updated = rotateOnCall(id)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(updated)
  }

  if (body.action === 'escalate') {
    const schedules = loadSchedules()
    const schedule = schedules.find(s => s.id === id)
    if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const incidentId = String(body.incidentId ?? '')
    const incident = incidentId ? loadIncidents().find(i => i.id === incidentId) : undefined

    const member = schedule.escalation?.[0] ?? schedule.members.find(m => m.id === schedule.currentOnCall)
    if (!member) return NextResponse.json({ error: 'No escalation target available' }, { status: 400 })

    const esc = addEscalation({
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      incidentId: incident?.id,
      incidentTitle: incident?.title,
      escalatedTo: `${member.name} <${member.email}>`,
      reason: String(body.reason ?? 'Manual escalation'),
    })
    return NextResponse.json(esc)
  }

  const schedules = loadSchedules()
  const idx = schedules.findIndex(s => s.id === id)
  if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = {
    ...schedules[idx],
    ...body,
    updatedAt: new Date().toISOString(),
  }
  saveSchedule(updated)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params
  deleteSchedule(id)
  return NextResponse.json({ ok: true })
}
