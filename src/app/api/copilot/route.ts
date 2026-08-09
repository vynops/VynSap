import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { askCopilotDetailed, ERP_COPILOT_SYSTEM } from '@/lib/copilot'
import {
  addCopilotHistoryEntry,
  clearCopilotHistory,
  getCopilotUsageSummary,
  loadCopilotHistory,
} from '@/lib/copilot-history-store'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { getLiveMetrics } from '@/lib/scheduler-runner'
import { buildRagContext } from '@/lib/rag'
import { appendAudit } from '@/lib/audit-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  return NextResponse.json({
    history: loadCopilotHistory(),
    usage: getCopilotUsageSummary(),
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  clearCopilotHistory()
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { message, connId, history } = await req.json()
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  // Build rich live context: scheduler metrics + targeted ERP queries + RAG
  let context = ''
  const liveMetrics = getLiveMetrics()
  if (liveMetrics.length > 0) {
    const snapshot = liveMetrics.map(m => `${m.connName}: CPU ${m.cpuPct}%, Mem ${m.memPct}%, Conn ${m.activeConn}, ReplLag ${m.replLagSec}s, SlowQ ${m.slowQueries} (sampled ${m.sampledAt})`).join('\n')
    context += `\n\n--- Live System Metrics ---\n${snapshot}`
  }
  if (connId) {
    const conn = loadConnections().find(c => c.id === connId)
    if (conn) {
      const [db, svc, slowQ, memRow, alertRow] = await Promise.all([
        queryErp(conn, 'SELECT SYSTEM_ID, VERSION, USAGE FROM M_DATABASE LIMIT 1'),
        queryErp(conn, "SELECT COUNT(*) AS SVC FROM M_SERVICES WHERE ACTIVE_STATUS='YES'"),
        queryErp(conn, 'SELECT SUBSTR(STATEMENT_STRING,1,120) AS SQL, ROUND(AVG_EXECUTION_TIME/1000000,2) AS AVG_SEC FROM M_SQL_PLAN_CACHE WHERE AVG_EXECUTION_TIME > 2000000 ORDER BY AVG_EXECUTION_TIME DESC LIMIT 3'),
        queryErp(conn, 'SELECT ROUND(USED_PHYSICAL_MEMORY/1073741824,1) AS USED_GB, ROUND(ALLOCATION_LIMIT/1073741824,1) AS LIMIT_GB FROM M_HOST_RESOURCE_UTILIZATION LIMIT 1'),
        queryErp(conn, 'SELECT COUNT(*) AS CNT FROM M_ALERTS WHERE ALERT_RATING >= 4'),
      ])
      context += `\n\n--- Connected System: ${conn.name} ---`
      context += `\nVersion: ${db[0]?.VERSION ?? 'unknown'} | Active services: ${svc[0]?.SVC ?? 0}`
      if (memRow[0]) context += `\nMemory: ${memRow[0].USED_GB}GB used / ${memRow[0].LIMIT_GB}GB limit`
      if (Number(alertRow[0]?.CNT ?? 0) > 0) context += `\nActive alerts (≥ high): ${alertRow[0]?.CNT}`
      if (slowQ.length > 0) context += `\nSlow queries: ${slowQ.map(q => `[${q.AVG_SEC}s] ${String(q.SQL ?? '').slice(0, 80)}`).join(' | ')}`
    }
  }

  // RAG: inject relevant knowledge chunks
  const ragContext = buildRagContext(message)
  const systemPrompt = ERP_COPILOT_SYSTEM + context + ragContext

  // Build conversation
  const historyStr = Array.isArray(history)
    ? history.slice(-6).map((h: { role: string; content: string }) => `${h.role}: ${h.content}`).join('\n')
    : ''

  const userMsg = historyStr ? `${historyStr}\nuser: ${message}` : message
  const result = await askCopilotDetailed(systemPrompt, userMsg)
  const connName = connId ? loadConnections().find(c => c.id === connId)?.name : undefined

  appendAudit({ actor: (auth as { name?: string }).name ?? 'unknown', actorRole: (auth as { role?: string }).role ?? 'viewer', action: 'copilot_query', resource: 'copilot', detail: message.slice(0, 120), outcome: 'success' })

  const saved = addCopilotHistoryEntry({
    connId,
    connName,
    prompt: message,
    reply: result.reply,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
  })

  return NextResponse.json({
    reply: result.reply,
    usage: {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
    },
    historyEntry: saved,
  })
}
