import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadProposals, saveProposal, deleteProposal } from '@/lib/autonomous-store'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { appendAudit } from '@/lib/audit-store'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const props = loadProposals()
  const idx = props.findIndex(p => p.id === id)
  if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()

  if (body.action === 'approve') {
    props[idx].status = 'approved'
    props[idx].approvedBy = (auth as { name: string }).name
    appendAudit({ actor: (auth as { name?: string }).name ?? 'unknown', actorRole: (auth as { role?: string }).role ?? 'editor', action: 'approve_proposal', resource: 'autonomous-proposal', resourceId: id, detail: props[idx].title, outcome: 'success' })
  } else if (body.action === 'reject') {
    props[idx].status = 'rejected'
    appendAudit({ actor: (auth as { name?: string }).name ?? 'unknown', actorRole: (auth as { role?: string }).role ?? 'editor', action: 'reject_proposal', resource: 'autonomous-proposal', resourceId: id, detail: props[idx].title, outcome: 'success' })
  } else if (body.action === 'apply') {
    if (props[idx].status !== 'approved') {
      return NextResponse.json({ error: 'Proposal must be approved before apply' }, { status: 400 })
    }

    const adminAuth = await requireRole(req, 'admin')
    if (adminAuth instanceof NextResponse) return adminAuth

    // Execute SQL if present
    const prop = props[idx]
    if (prop.sql && prop.connectionId) {
      const conn = loadConnections().find(c => c.id === prop.connectionId)
      if (conn) {
        try {
          await queryErp(conn, prop.sql)
          props[idx].status = 'applied'
          props[idx].appliedAt = new Date().toISOString()
          props[idx].aiReasoning = `${props[idx].aiReasoning}\n\nExecution: SQL applied by ${(adminAuth as { name: string }).name} at ${props[idx].appliedAt}.`
          appendAudit({ actor: (adminAuth as { name?: string }).name ?? 'admin', actorRole: 'admin', action: 'apply_proposal', resource: 'autonomous-proposal', resourceId: id, detail: props[idx].title, outcome: 'success' })
        } catch (e) {
          props[idx].status = 'failed'
          props[idx].aiReasoning = `${props[idx].aiReasoning}\n\nExecution failed: ${(e as Error).message}`
          appendAudit({ actor: (adminAuth as { name?: string }).name ?? 'admin', actorRole: 'admin', action: 'apply_proposal', resource: 'autonomous-proposal', resourceId: id, detail: `FAILED: ${(e as Error).message}`, outcome: 'failure' })
          return NextResponse.json({ error: (e as Error).message }, { status: 500 })
        }
      }
    } else {
      props[idx].status = 'applied'
      props[idx].appliedAt = new Date().toISOString()
      props[idx].aiReasoning = `${props[idx].aiReasoning}\n\nExecution: Change marked as applied by ${(adminAuth as { name: string }).name} at ${props[idx].appliedAt}.`
    }
  }
  saveProposal(props[idx])
  return NextResponse.json(props[idx])
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const props = loadProposals()
  const prop = props.find(p => p.id === id)
  deleteProposal(id)
  appendAudit({ actor: (auth as { name?: string }).name ?? 'admin', actorRole: 'admin', action: 'delete_proposal', resource: 'autonomous-proposal', resourceId: id, detail: prop?.title ?? id, outcome: 'success' })
  return NextResponse.json({ ok: true })
}
