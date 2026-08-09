/**
 * Background scheduler — evaluates automation rules and generates autonomous proposals on a timer.
 * Started via src/instrumentation.ts on Next.js server boot.
 */
import { loadRules, loadRuns, addRun, newRunId } from './automation-store'
import { loadConnections } from './connection-store'
import { queryErp } from './erp-client'
import { loadSettings } from './settings-store'
import { notify } from './notifications'
import { askCopilot, ERP_COPILOT_SYSTEM } from './copilot'
import { loadProposals, saveProposal, newProposalId } from './autonomous-store'
import type { AutomationRule } from './automation-store'
import type { ProposalCategory } from './autonomous-store'
import { appendAudit } from './audit-store'

let started = false

// ─── Metric snapshot cache (updated every poll cycle) ────────────────────────
export interface LiveMetric {
  connId: string
  connName: string
  cpuPct: number
  memPct: number
  replLagSec: number
  activeConn: number
  slowQueries: number
  sampledAt: string
}
const metricsCache: Map<string, LiveMetric> = new Map()

export function getLiveMetrics(): LiveMetric[] {
  return Array.from(metricsCache.values())
}

// ─── Poll all connections for key metrics ─────────────────────────────────────
async function pollMetrics() {
  const conns = loadConnections()
  for (const conn of conns) {
    try {
      const [cpu, mem, replRows, connRows, slowRows] = await Promise.all([
        queryErp(conn, `SELECT ROUND(100 - IDLE_CPU_PCT, 1) AS CPU_USED_PCT FROM M_HOST_RESOURCE_UTILIZATION`),
        queryErp(conn, `SELECT ROUND(TOTAL_MEMORY_USED_SIZE/ALLOCATION_LIMIT*100,1) AS MEM_PCT FROM M_HOST_RESOURCE_UTILIZATION`),
        queryErp(conn, `SELECT REPLICATION_DELAY_MS FROM M_SERVICE_REPLICATION LIMIT 1`),
        queryErp(conn, `SELECT RUNNING FROM M_CONNECTIONS LIMIT 1`),
        queryErp(conn, `SELECT COUNT(*) AS CNT FROM M_SQL_PLAN_CACHE WHERE AVG_EXECUTION_TIME > 5000000`),
      ])

      // Compute memory percentage from separate USED/LIMIT fields if MEM_PCT not available
      let memPct = Number(mem[0]?.MEM_PCT ?? 0)
      if (!memPct && mem[0]) {
        const usedGb  = Number(mem[0]?.USED_GB  ?? mem[0]?.MEM_USED_GB  ?? 0)
        const limitGb = Number(mem[0]?.LIMIT_GB ?? mem[0]?.MEM_LIMIT_GB ?? 1)
        memPct = limitGb > 0 ? +((usedGb / limitGb) * 100).toFixed(1) : 0
      }

      metricsCache.set(conn.id, {
        connId: conn.id,
        connName: conn.name,
        cpuPct: Number(cpu[0]?.CPU_USED_PCT ?? 0),
        memPct,
        replLagSec: Number(replRows[0]?.REPLICATION_DELAY_MS ?? 0) / 1000,
        activeConn: Number(connRows[0]?.RUNNING ?? 0),
        slowQueries: Number(slowRows[0]?.CNT ?? 0),
        sampledAt: new Date().toISOString(),
      })
    } catch { /* ignore per-connection errors */ }
  }
}

// ─── Evaluate a metric_threshold rule against cached metrics ──────────────────
function evaluateThreshold(rule: AutomationRule, metric: LiveMetric): boolean {
  const m = rule.trigger.metric ?? ''
  const threshold = Number(rule.trigger.threshold ?? 0)
  const condition = rule.trigger.condition ?? 'gt'
  let value = 0
  if (m.includes('cpu'))    value = metric.cpuPct
  else if (m.includes('mem')) value = metric.memPct
  else if (m.includes('repl') || m.includes('lag')) value = metric.replLagSec
  else if (m.includes('conn')) value = metric.activeConn
  else if (m.includes('slow')) value = metric.slowQueries
  else return false
  if (condition === 'gt' || condition === '>') return value > threshold
  if (condition === 'lt' || condition === '<') return value < threshold
  if (condition === 'gte' || condition === '>=') return value >= threshold
  return false
}

// ─── Execute a triggered rule action ─────────────────────────────────────────
async function fireRule(rule: AutomationRule, reason: string) {
  const runId = newRunId()
  const startedAt = new Date().toISOString()
  try {
    if (rule.action.type === 'send_alert') {
      await notify({ title: rule.name, body: reason, severity: 'high', source: 'Automation Scheduler' })
    } else if (rule.action.type === 'webhook' && rule.action.webhookUrl) {
      await fetch(rule.action.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'vynsap', ruleId: rule.id, ruleName: rule.name, reason, at: startedAt }), signal: AbortSignal.timeout(8000) })
    } else if (rule.action.type === 'create_incident') {
      const { createIncident, saveIncident } = await import('./incident-store')
      const inc = createIncident({ title: `[Auto] ${rule.name}`, description: reason, severity: 'high', status: 'open', tags: ['automation', 'scheduler'] })
      saveIncident(inc)
    } else if (rule.action.type === 'run_sql' && rule.action.sql) {
      const conn = loadConnections().find(c => c.id === (rule.action.connectionId ?? rule.connectionId))
      if (conn) await queryErp(conn, rule.action.sql)
    }
    addRun({ id: runId, ruleId: rule.id, ruleName: rule.name, status: 'success', startedAt, completedAt: new Date().toISOString(), output: reason })
    appendAudit({ actor: 'scheduler', actorRole: 'system', action: 'scheduler_fire', resource: 'automation-rule', resourceId: rule.id, detail: reason, outcome: 'success' })
  } catch (e) {
    addRun({ id: runId, ruleId: rule.id, ruleName: rule.name, status: 'failure', startedAt, completedAt: new Date().toISOString(), error: (e as Error).message })
  }
}

// ─── Simple cron-string evaluator (minute-level) ─────────────────────────────
function cronMatches(expr: string): boolean {
  if (!expr) return false
  const now = new Date()
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return false
  const [min, hour, dom, mon, dow] = parts
  const match = (field: string, val: number) => {
    if (field === '*') return true
    if (field.includes('/')) { const [, step] = field.split('/'); return val % Number(step) === 0 }
    return field.split(',').includes(String(val))
  }
  return match(min, now.getMinutes()) && match(hour, now.getHours()) && match(dom, now.getDate()) && match(mon, now.getMonth() + 1) && match(dow, now.getDay())
}

// ─── Evaluate all automation rules ───────────────────────────────────────────
async function evaluateRules() {
  const rules = loadRules().filter(r => r.enabled)
  const metrics = getLiveMetrics()

  for (const rule of rules) {
    try {
      if (rule.trigger.type === 'metric_threshold') {
        const connMetric = rule.connectionId ? metrics.find(m => m.connId === rule.connectionId) : metrics[0]
        if (!connMetric) continue
        if (evaluateThreshold(rule, connMetric)) {
          const reason = `Threshold breach on ${connMetric.connName}: cpu=${connMetric.cpuPct}% mem=${connMetric.memPct}% replLag=${connMetric.replLagSec}s`
          await fireRule(rule, reason)
        }
      } else if (rule.trigger.type === 'schedule' && rule.trigger.schedule) {
        if (cronMatches(rule.trigger.schedule)) {
          await fireRule(rule, `Scheduled execution at ${new Date().toISOString()}`)
        }
      } else if (rule.trigger.type === 'slow_query') {
        const connMetric = rule.connectionId ? metrics.find(m => m.connId === rule.connectionId) : metrics[0]
        if (connMetric && connMetric.slowQueries > (rule.trigger.threshold ?? 0)) {
          await fireRule(rule, `${connMetric.slowQueries} slow queries detected on ${connMetric.connName}`)
        }
      } else if (rule.trigger.type === 'replication_lag') {
        const connMetric = rule.connectionId ? metrics.find(m => m.connId === rule.connectionId) : metrics[0]
        if (connMetric && connMetric.replLagSec > (rule.trigger.threshold ?? 60)) {
          await fireRule(rule, `Replication lag ${connMetric.replLagSec}s on ${connMetric.connName} exceeds threshold`)
        }
      }
    } catch { /* ignore per-rule errors */ }
  }
}

// ─── Auto-generate autonomous proposals when metrics are critical ─────────────
async function autoGenerateProposals() {
  const settings = loadSettings()
  if (settings.autoProposals === false) return

  const metrics = getLiveMetrics()
  const critical = metrics.filter(m => m.cpuPct > 85 || m.memPct > 85 || m.replLagSec > 120 || m.slowQueries > 5)
  if (critical.length === 0) return

  // Don't spam — only generate if no pending proposals exist for this conn
  const existing = loadProposals()
  for (const metric of critical.slice(0, 2)) {
    const hasPending = existing.some(p => p.connectionId === metric.connId && p.status === 'pending' && new Date(p.createdAt) > new Date(Date.now() - 3600000))
    if (hasPending) continue

    const conns = loadConnections()
    const conn = conns.find(c => c.id === metric.connId)
    if (!conn) continue

    try {
      const [slowQ, memRows] = await Promise.all([
        queryErp(conn, `SELECT SUBSTR(STATEMENT_STRING,1,200) AS SQL, ROUND(AVG_EXECUTION_TIME/1000000,2) AS AVG_SEC, EXECUTION_COUNT FROM M_SQL_PLAN_CACHE WHERE AVG_EXECUTION_TIME > 5000000 ORDER BY AVG_EXECUTION_TIME DESC LIMIT 3`),
        queryErp(conn, `SELECT ROUND(USED_PHYSICAL_MEMORY/1073741824,1) AS USED_GB, ROUND(ALLOCATION_LIMIT/1073741824,1) AS LIMIT_GB FROM M_HOST_RESOURCE_UTILIZATION LIMIT 1`),
      ])
      const context = `System: ${conn.name}\nCPU: ${metric.cpuPct}%\nMemory: ${metric.memPct}%\nReplication lag: ${metric.replLagSec}s\nSlow queries: ${metric.slowQueries}\nMem detail: ${JSON.stringify(memRows[0] ?? {})}\nTop slow SQL: ${JSON.stringify(slowQ)}`
      const prompt = `Analyze these metrics and generate 2-3 optimization proposals:\n${context}\n\nReturn JSON array with fields: title, description, category (performance|memory|security|capacity|column_store|schema|replication|backup), impact (critical|high|medium|low), effort (auto|low|medium|high), riskLevel (safe|low|medium|high), expectedGain, aiReasoning, sql (optional).`
      const raw = await askCopilot(ERP_COPILOT_SYSTEM + '\nRespond ONLY with a JSON array.', prompt)
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) continue
      const proposals = JSON.parse(match[0]) as Record<string, unknown>[]
      for (const p of proposals.slice(0, 3)) {
        saveProposal({
          id: newProposalId(),
          title: String(p.title ?? 'Auto-generated proposal'),
          description: String(p.description ?? ''),
          category: String(p.category ?? 'performance') as ProposalCategory,
          impact: String(p.impact ?? 'medium') as 'critical' | 'high' | 'medium' | 'low',
          effort: String(p.effort ?? 'low') as 'auto' | 'low' | 'medium' | 'high',
          riskLevel: String(p.riskLevel ?? 'safe') as 'safe' | 'low' | 'medium' | 'high',
          expectedGain: String(p.expectedGain ?? ''),
          aiReasoning: String(p.aiReasoning ?? ''),
          sql: p.sql as string | undefined,
          status: 'pending',
          connectionId: conn.id,
          connectionName: conn.name,
          createdAt: new Date().toISOString(),
        })
      }
      // Notify if any critical proposals
      await notify({ title: `AI proposals generated for ${conn.name}`, body: `${proposals.length} optimization proposal(s) ready for review. CPU: ${metric.cpuPct}%, Mem: ${metric.memPct}%`, severity: metric.cpuPct > 90 || metric.memPct > 90 ? 'high' : 'medium', source: 'Autonomous Scheduler' })
    } catch { /* ignore */ }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function startScheduler() {
  if (started) return
  started = true

  const settings = loadSettings()
  const intervalSec = settings.monitorIntervalSec ?? 60

  // Initial poll immediately
  void pollMetrics()

  setInterval(async () => {
    await pollMetrics()
    await evaluateRules()
  }, intervalSec * 1000)

  // Autonomous proposal generation every 10 minutes
  setInterval(async () => {
    await autoGenerateProposals()
  }, 10 * 60 * 1000)

  console.log(`[VynSAP Scheduler] Started — polling every ${intervalSec}s`)
}
