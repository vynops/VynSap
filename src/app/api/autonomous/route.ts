import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadProposals, saveProposal, newProposalId } from '@/lib/autonomous-store'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { askCopilot, ERP_COPILOT_SYSTEM } from '@/lib/copilot'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(loadProposals())
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()

  if (body.action === 'generate') {
    // Generate AI proposals based on current ERP DB metrics
    const conns = loadConnections().slice(0, 3)
    const contextParts: string[] = []

    for (const conn of conns) {
      const [slowQ, memory, unloads] = await Promise.all([
        queryErp(conn, `SELECT SUBSTR(STATEMENT_STRING,1,200) AS SQL, ROUND(AVG_EXECUTION_TIME/1000000,2) AS AVG_SEC, EXECUTION_COUNT FROM M_SQL_PLAN_CACHE WHERE AVG_EXECUTION_TIME > 5000000 ORDER BY AVG_EXECUTION_TIME DESC LIMIT 5`),
        queryErp(conn, `SELECT ROUND(USED_PHYSICAL_MEMORY/1073741824,1) AS USED_GB, ROUND(ALLOCATION_LIMIT/1073741824,1) AS LIMIT_GB FROM M_HOST_RESOURCE_UTILIZATION LIMIT 1`),
        queryErp(conn, `SELECT SCHEMA_NAME, TABLE_NAME, COUNT(*) AS UNLOADS FROM M_CS_UNLOADS GROUP BY SCHEMA_NAME, TABLE_NAME ORDER BY UNLOADS DESC LIMIT 5`),
      ])
      contextParts.push(`System: ${conn.name}\nMemory: ${JSON.stringify(memory[0] ?? {})}\nTop slow queries: ${JSON.stringify(slowQ)}\nFrequent unloads: ${JSON.stringify(unloads)}`)
    }

    const systemPrompt = ERP_COPILOT_SYSTEM + '\nRespond ONLY with a JSON array of proposals.'
    const prompt = `Analyze these SAP ERP metrics and generate optimization proposals:\n${contextParts.join('\n---\n')}\n\nReturn JSON array with fields: title, description, category (performance|memory|security|capacity|column_store|schema|replication|backup), impact (critical|high|medium|low), effort (auto|low|medium|high), riskLevel (safe|low|medium|high), expectedGain, aiReasoning, sql (optional ERP database SQL to execute).`

    const raw = await askCopilot(systemPrompt, prompt)
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      const proposals = jsonMatch ? JSON.parse(jsonMatch[0]) : []
      const saved = proposals.slice(0, 5).map((p: Record<string, unknown>) => {
        const prop = {
          id: newProposalId(),
          title: String(p.title ?? 'Untitled'),
          description: String(p.description ?? ''),
          category: String(p.category ?? 'performance') as import('@/lib/autonomous-store').ProposalCategory,
          impact: String(p.impact ?? 'medium') as 'critical' | 'high' | 'medium' | 'low',
          effort: String(p.effort ?? 'low') as 'auto' | 'low' | 'medium' | 'high',
          riskLevel: String(p.riskLevel ?? 'safe') as 'safe' | 'low' | 'medium' | 'high',
          expectedGain: String(p.expectedGain ?? ''),
          aiReasoning: String(p.aiReasoning ?? ''),
          sql: p.sql as string | undefined,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        }
        saveProposal(prop)
        return prop
      })
      return NextResponse.json(saved)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI proposals', raw }, { status: 500 })
    }
  }

  // Manual proposal creation
  const prop = {
    id: newProposalId(),
    title: body.title,
    description: body.description,
    category: body.category,
    impact: body.impact ?? 'medium',
    effort: body.effort ?? 'low',
    status: 'pending' as const,
    expectedGain: body.expectedGain ?? '',
    riskLevel: body.riskLevel ?? 'safe',
    aiReasoning: body.aiReasoning ?? '',
    sql: body.sql,
    createdAt: new Date().toISOString(),
  }
  saveProposal(prop)
  return NextResponse.json(prop, { status: 201 })
}
