import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadIncidents, saveIncident, createIncident } from '@/lib/incident-store'
import crypto from 'crypto'

function severityImpact(severity: string): number {
  if (severity === 'critical') return 90
  if (severity === 'high') return 72
  if (severity === 'medium') return 48
  return 28
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function getBusinessImpactScore(inc: { severity: string; status: string; createdAt: string }): number {
  const ageHours = Math.max(0, (Date.now() - new Date(inc.createdAt).getTime()) / 3600000)
  const unresolvedBonus = inc.status === 'resolved' || inc.status === 'closed' ? 0 : 12
  const ageBonus = Math.min(15, Math.round(ageHours / 4))
  return clamp(severityImpact(inc.severity) + unresolvedBonus + ageBonus, 0, 100)
}

function deriveMttdMins(inc: { createdAt: string; timeline?: Array<{ at: string; by: string }> }): number {
  const createdAt = new Date(inc.createdAt).getTime()
  const timeline = Array.isArray(inc.timeline) ? [...inc.timeline] : []
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  const detectionEvent = timeline.find(t => {
    const by = String(t.by ?? '').toLowerCase()
    return by === 'monitor' || by === 'system'
  })
  const detectedAt = detectionEvent ? new Date(detectionEvent.at).getTime() : createdAt

  const acknowledgedEvent = timeline.find(t => {
    const by = String(t.by ?? '').toLowerCase()
    return by !== 'monitor' && by !== 'system'
  })
  const ackAt = acknowledgedEvent ? new Date(acknowledgedEvent.at).getTime() : createdAt

  if (!Number.isFinite(detectedAt) || !Number.isFinite(ackAt)) return 0
  return Math.max(0, (ackAt - detectedAt) / 60000)
}

function buildIncidentKpis(incidents: Array<{ createdAt: string; resolvedAt?: string; severity: string; status: string; timeline?: Array<{ at: string; by: string }> }>) {
  const now = Date.now()
  const dayMs = 24 * 3600 * 1000
  const trend = [] as Array<{ day: string; mttrHours: number; mttdMins: number }>

  for (let i = 6; i >= 0; i -= 1) {
    const start = now - i * dayMs
    const end = start + dayMs
    const daily = incidents.filter(inc => {
      const t = new Date(inc.createdAt).getTime()
      return t >= start && t < end
    })
    const resolved = daily.filter(inc => !!inc.resolvedAt)
    const mttrHours = resolved.length === 0
      ? 0
      : resolved.reduce((n, inc) => {
          const created = new Date(inc.createdAt).getTime()
          const resolvedAt = new Date(inc.resolvedAt as string).getTime()
          return n + Math.max(0, resolvedAt - created) / 3600000
        }, 0) / resolved.length
    const mttdMins = daily.length === 0
      ? 0
      : daily.reduce((n, inc) => n + deriveMttdMins(inc), 0) / daily.length
    trend.push({
      day: new Date(start).toISOString().slice(0, 10),
      mttrHours: Number(mttrHours.toFixed(2)),
      mttdMins: Number(mttdMins.toFixed(1)),
    })
  }

  const last30d = incidents.filter(inc => new Date(inc.createdAt).getTime() >= now - 30 * dayMs)
  const resolved30d = last30d.filter(inc => !!inc.resolvedAt)
  const mttrHours = resolved30d.length === 0
    ? 0
    : resolved30d.reduce((n, inc) => {
        const created = new Date(inc.createdAt).getTime()
        const resolvedAt = new Date(inc.resolvedAt as string).getTime()
        return n + Math.max(0, resolvedAt - created) / 3600000
      }, 0) / resolved30d.length
  const mttdMins = last30d.length === 0
    ? 0
    : last30d.reduce((n, inc) => n + deriveMttdMins(inc), 0) / last30d.length

  return {
    summary: {
      mttrHours: Number(mttrHours.toFixed(2)),
      mttdMins: Number(mttdMins.toFixed(1)),
      activeBusinessImpact: incidents
        .filter(inc => inc.status !== 'resolved' && inc.status !== 'closed')
        .reduce((n, inc) => n + getBusinessImpactScore(inc), 0),
    },
    trends: trend,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const includeKpis = searchParams.get('includeKpis') === '1'
  const incidents = loadIncidents()
  const enriched = incidents.map(inc => ({
    ...inc,
    businessImpactScore: getBusinessImpactScore(inc),
  }))

  if (!includeKpis) return NextResponse.json(enriched)

  return NextResponse.json({
    incidents: enriched,
    kpis: buildIncidentKpis(enriched),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const inc = createIncident({
    title: body.title,
    description: body.description ?? '',
    severity: body.severity ?? 'medium',
    status: 'open',
    connectionId: body.connectionId,
    connectionName: body.connectionName,
    assignee: body.assignee,
    tags: body.tags ?? [],
  })
  saveIncident(inc)
  return NextResponse.json(inc, { status: 201 })
}
