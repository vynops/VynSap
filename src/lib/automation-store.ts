import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isDemoWorkspace, loadConnections } from './connection-store'

const RULES_FILE = path.join(process.cwd(), 'data', 'automation-rules.json')
const RUNS_FILE  = path.join(process.cwd(), 'data', 'automation-runs.json')

export type TriggerType = 'metric_threshold' | 'schedule' | 'alert' | 'manual' | 'slow_query' | 'backup_failure' | 'replication_lag'
export type ActionType  = 'run_sql' | 'send_alert' | 'create_incident' | 'scale_memory' | 'delta_merge' | 'table_unload' | 'webhook' | 'update_stats'

export interface AutomationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: {
    type: TriggerType
    condition?: string  // e.g. "cpu_pct > 80"
    schedule?: string   // cron expression
    threshold?: number
    metric?: string
  }
  action: {
    type: ActionType
    sql?: string
    message?: string
    webhookUrl?: string
    connectionId?: string
  }
  connectionId?: string
  lastRun?: string
  runCount: number
  createdAt: string
}

export interface AutomationRun {
  id: string
  ruleId: string
  ruleName: string
  status: 'success' | 'failure' | 'skipped'
  startedAt: string
  completedAt: string
  output?: string
  error?: string
}

function readRules(): AutomationRule[] {
  try { return JSON.parse(fs.readFileSync(RULES_FILE, 'utf8')) } catch { return [] }
}
function writeRules(list: AutomationRule[]) {
  fs.writeFileSync(RULES_FILE, JSON.stringify(list, null, 2), 'utf8')
}
function readRuns(): AutomationRun[] {
  try { return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8')) } catch { return [] }
}
function writeRuns(list: AutomationRun[]) {
  fs.writeFileSync(RUNS_FILE, JSON.stringify(list, null, 2), 'utf8')
}

function mergeById<T extends { id: string }>(primary: T[], fallback: T[]): T[] {
  const seen = new Set(primary.map(item => item.id))
  const merged = [...primary]
  for (const item of fallback) {
    if (!seen.has(item.id)) merged.push(item)
  }
  return merged
}

function demoRules(): AutomationRule[] {
  const conn = loadConnections()[0]
  const now = Date.now()
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString()

  return [
    {
      id: 'rule-demo-1',
      name: 'Nightly delta merge review',
      description: 'Runs delta-merge advisory SQL and flags high-delta tables before business open.',
      enabled: true,
      trigger: { type: 'schedule', schedule: '0 2 * * *' },
      action: { type: 'run_sql', sql: 'SELECT SCHEMA_NAME, TABLE_NAME FROM M_CS_TABLES ORDER BY MEMORY_SIZE_IN_DELTA DESC LIMIT 10', connectionId: conn?.id },
      connectionId: conn?.id,
      lastRun: iso(8),
      runCount: 14,
      createdAt: iso(240),
    },
    {
      id: 'rule-demo-2',
      name: 'Escalate stale backup window',
      description: 'Creates an incident when backup freshness exceeds policy threshold.',
      enabled: true,
      trigger: { type: 'backup_failure', threshold: 1, metric: 'backup_age_hours' },
      action: { type: 'create_incident', message: 'Backup freshness breached operational target' },
      connectionId: conn?.id,
      lastRun: iso(3),
      runCount: 6,
      createdAt: iso(144),
    },
    {
      id: 'rule-demo-3',
      name: 'Notify on replication lag',
      description: 'Sends a webhook when HSR lag remains elevated.',
      enabled: false,
      trigger: { type: 'replication_lag', threshold: 10, metric: 'replication_delay_ms' },
      action: { type: 'webhook', webhookUrl: 'https://ops.example.local/hook/erp-lag' },
      connectionId: conn?.id,
      lastRun: iso(26),
      runCount: 2,
      createdAt: iso(96),
    },
    {
      id: 'rule-demo-4',
      name: 'Morning expensive query sweep',
      description: 'Runs a focused expensive-statement scan before business traffic ramps up.',
      enabled: true,
      trigger: { type: 'schedule', schedule: '30 6 * * 1-5' },
      action: { type: 'run_sql', sql: 'SELECT STATEMENT_HASH, AVG_EXECUTION_TIME FROM M_SQL_PLAN_CACHE ORDER BY AVG_EXECUTION_TIME DESC LIMIT 20', connectionId: conn?.id },
      connectionId: conn?.id,
      lastRun: iso(1.5),
      runCount: 21,
      createdAt: iso(312),
    },
    {
      id: 'rule-demo-5',
      name: 'Table unload anomaly ticket',
      description: 'Creates an incident when unload activity exceeds baseline for business schemas.',
      enabled: true,
      trigger: { type: 'slow_query', threshold: 15, metric: 'cs_unload_count' },
      action: { type: 'create_incident', message: 'Column-store unload anomaly detected in production workload' },
      connectionId: conn?.id,
      lastRun: iso(11),
      runCount: 9,
      createdAt: iso(180),
    },
    {
      id: 'rule-demo-6',
      name: 'Post-maintenance statistics refresh',
      description: 'Refreshes optimizer statistics after planned maintenance windows.',
      enabled: true,
      trigger: { type: 'manual' },
      action: { type: 'update_stats', message: 'Refreshing optimizer statistics after maintenance' },
      connectionId: conn?.id,
      lastRun: iso(38),
      runCount: 4,
      createdAt: iso(120),
    },
  ]
}

function demoRuns(): AutomationRun[] {
  const now = Date.now()
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString()

  return [
    {
      id: 'run-demo-1',
      ruleId: 'rule-demo-1',
      ruleName: 'Nightly delta merge review',
      status: 'success',
      startedAt: iso(8),
      completedAt: iso(7.97),
      output: 'Executed SQL. Rows returned: 10',
    },
    {
      id: 'run-demo-2',
      ruleId: 'rule-demo-2',
      ruleName: 'Escalate stale backup window',
      status: 'success',
      startedAt: iso(3),
      completedAt: iso(2.99),
      output: 'Incident created: demo-inc-2',
    },
    {
      id: 'run-demo-3',
      ruleId: 'rule-demo-3',
      ruleName: 'Notify on replication lag',
      status: 'failure',
      startedAt: iso(26),
      completedAt: iso(25.99),
      error: 'Webhook endpoint timed out after 8 seconds',
    },
    {
      id: 'run-demo-4',
      ruleId: 'rule-demo-4',
      ruleName: 'Morning expensive query sweep',
      status: 'success',
      startedAt: iso(1.5),
      completedAt: iso(1.47),
      output: 'Executed SQL. Rows returned: 20',
    },
    {
      id: 'run-demo-5',
      ruleId: 'rule-demo-4',
      ruleName: 'Morning expensive query sweep',
      status: 'success',
      startedAt: iso(25.5),
      completedAt: iso(25.46),
      output: 'Executed SQL. Rows returned: 20',
    },
    {
      id: 'run-demo-6',
      ruleId: 'rule-demo-5',
      ruleName: 'Table unload anomaly ticket',
      status: 'success',
      startedAt: iso(11),
      completedAt: iso(10.98),
      output: 'Incident created: demo-inc-3',
    },
    {
      id: 'run-demo-7',
      ruleId: 'rule-demo-5',
      ruleName: 'Table unload anomaly ticket',
      status: 'skipped',
      startedAt: iso(35),
      completedAt: iso(34.99),
      output: 'Rule condition not met; unload rate returned to baseline',
    },
    {
      id: 'run-demo-8',
      ruleId: 'rule-demo-6',
      ruleName: 'Post-maintenance statistics refresh',
      status: 'success',
      startedAt: iso(38),
      completedAt: iso(37.95),
      output: 'Action update_stats executed as simulated operation',
    },
    {
      id: 'run-demo-9',
      ruleId: 'rule-demo-1',
      ruleName: 'Nightly delta merge review',
      status: 'success',
      startedAt: iso(32),
      completedAt: iso(31.96),
      output: 'Executed SQL. Rows returned: 10',
    },
  ]
}

export function loadRules(): AutomationRule[] {
  const list = readRules()
  if (isDemoWorkspace()) return mergeById(list, demoRules())
  return list
}

export function loadRuns(): AutomationRun[] {
  const list = readRuns()
  if (isDemoWorkspace()) return mergeById(list, demoRuns())
  return list
}

export function saveRule(rule: AutomationRule) {
  const list = readRules()
  const idx = list.findIndex(r => r.id === rule.id)
  if (idx >= 0) list[idx] = rule
  else list.push(rule)
  writeRules(list)
}

export function deleteRule(id: string) { writeRules(readRules().filter(r => r.id !== id)) }

export function addRun(run: AutomationRun) {
  const list = readRuns()
  list.unshift(run)
  if (list.length > 500) list.length = 500
  writeRuns(list)
}

export function newRuleId(): string { return `rule-${crypto.randomUUID().slice(0, 8)}` }
export function newRunId(): string  { return `run-${crypto.randomUUID().slice(0, 8)}` }
