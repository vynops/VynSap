import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { requireRole } from '@/lib/auth'
import { askCopilot, ERP_COPILOT_SYSTEM } from '@/lib/copilot'
import { notify } from '@/lib/notifications'
import { appendAudit } from '@/lib/audit-store'

const FILE = path.join(process.cwd(), 'data', 'transports.json')

export type TransportStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'released' | 'imported'
export type TransportType = 'workbench' | 'customizing' | 'transport-of-copies'
export type TransportRisk = 'safe' | 'low' | 'medium' | 'high' | 'critical'

export interface Transport {
  id: string
  number: string
  description: string
  type: TransportType
  status: TransportStatus
  targetSystem: string
  owner: string
  objects: string[]
  aiRisk: TransportRisk
  aiReview: string
  aiImpact: string
  approvedBy?: string
  releasedBy?: string
  createdAt: string
  updatedAt: string
}

function read(): Transport[] {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}
function write(list: Transport[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(read())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json() as Partial<Transport> & { action?: string }

  if (body.action === 'approve' || body.action === 'reject' || body.action === 'release' || body.action === 'import') {
    const list = read()
    const idx = list.findIndex(t => t.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const actor = (auth as { name?: string }).name ?? 'unknown'
    const actorRole = (auth as { role?: string }).role ?? 'editor'

    if (body.action === 'approve') {
      if (actorRole !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 })
      list[idx].status = 'approved'; list[idx].approvedBy = actor
      appendAudit({ actor, actorRole, action: 'approve_transport', resource: 'transport', resourceId: list[idx].id, detail: list[idx].description, outcome: 'success' })
    } else if (body.action === 'reject') {
      list[idx].status = 'rejected'
      appendAudit({ actor, actorRole, action: 'reject_transport', resource: 'transport', resourceId: list[idx].id, detail: list[idx].description, outcome: 'success' })
    } else if (body.action === 'release') {
      if (list[idx].status !== 'approved') return NextResponse.json({ error: 'Transport must be approved first' }, { status: 400 })
      if (actorRole !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 })
      list[idx].status = 'released'; list[idx].releasedBy = actor; list[idx].updatedAt = new Date().toISOString()
      appendAudit({ actor, actorRole, action: 'apply_transport', resource: 'transport', resourceId: list[idx].id, detail: `Released to ${list[idx].targetSystem}`, outcome: 'success' })
      await notify({ title: `Transport ${list[idx].number} released`, body: `${list[idx].description}\nTarget: ${list[idx].targetSystem}\nReleased by: ${actor}`, severity: list[idx].aiRisk === 'high' || list[idx].aiRisk === 'critical' ? 'high' : 'info', source: 'VynSAP Transport Manager' })
    } else if (body.action === 'import') {
      list[idx].status = 'imported'; list[idx].updatedAt = new Date().toISOString()
      appendAudit({ actor, actorRole, action: 'apply_transport', resource: 'transport', resourceId: list[idx].id, detail: `Imported to ${list[idx].targetSystem}`, outcome: 'success' })
    }

    write(list)
    return NextResponse.json(list[idx])
  }

  // Create new transport with AI risk review
  const transport: Transport = {
    id: `trp-${crypto.randomUUID().slice(0, 8)}`,
    number: `T${Date.now().toString().slice(-7)}`,
    description: String(body.description ?? ''),
    type: (body.type ?? 'customizing') as TransportType,
    status: 'review',
    targetSystem: String(body.targetSystem ?? 'PRODUCTION'),
    owner: (auth as { name?: string }).name ?? 'unknown',
    objects: Array.isArray(body.objects) ? body.objects : [],
    aiRisk: 'medium',
    aiReview: 'Pending AI analysis...',
    aiImpact: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // AI risk assessment
  try {
    const objectList = transport.objects.slice(0, 20).join(', ') || 'unspecified objects'
    const prompt = `Analyze this SAP transport request for risk and impact:\n\nTransport: ${transport.number}\nType: ${transport.type}\nDescription: ${transport.description}\nObjects: ${objectList}\nTarget: ${transport.targetSystem}\n\nRespond with JSON: { "risk": "safe|low|medium|high|critical", "review": "2-3 sentence risk assessment", "impact": "brief business impact statement" }`
    const raw = await askCopilot(ERP_COPILOT_SYSTEM + '\nRespond ONLY with JSON.', prompt)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>
      transport.aiRisk = (parsed.risk ?? 'medium') as TransportRisk
      transport.aiReview = parsed.review ?? ''
      transport.aiImpact = parsed.impact ?? ''
    }
  } catch { /* keep defaults */ }

  const list = read()
  list.unshift(transport)
  write(list)

  appendAudit({ actor: transport.owner, actorRole: (auth as { role?: string }).role ?? 'editor', action: 'create_transport', resource: 'transport', resourceId: transport.id, detail: transport.description, outcome: 'success' })

  // Alert on high-risk transports
  if (transport.aiRisk === 'high' || transport.aiRisk === 'critical') {
    await notify({ title: `High-risk transport submitted: ${transport.number}`, body: transport.aiReview, severity: transport.aiRisk === 'critical' ? 'critical' : 'high', source: 'VynSAP Transport Manager' })
  }

  return NextResponse.json(transport, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const list = read().filter(t => t.id !== id)
  write(list)
  return NextResponse.json({ ok: true })
}
