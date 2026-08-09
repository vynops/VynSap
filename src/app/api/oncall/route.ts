import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadSchedules, loadEscalations, saveSchedule, newScheduleId } from '@/lib/oncall-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const schedules = loadSchedules()
  const escalations = loadEscalations()
  const openEscalations = escalations.filter(e => !e.resolved)

  return NextResponse.json({
    schedules,
    escalations,
    stats: {
      scheduleCount: schedules.length,
      memberCount: schedules.reduce((n, s) => n + s.members.length, 0),
      openEscalations: openEscalations.length,
    },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const members = Array.isArray(body.members) ? body.members : []
  const s = {
    id: newScheduleId(),
    name: body.name,
    rotation: body.rotation ?? 'weekly',
    members,
    escalation: body.escalation ?? [],
    currentOnCall: body.currentOnCall ?? members[0]?.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  saveSchedule(s)
  return NextResponse.json(s, { status: 201 })
}
