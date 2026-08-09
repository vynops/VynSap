import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  loadRules,
  saveRule,
  deleteRule,
  loadRuns,
  addRun,
  newRuleId,
  newRunId,
  type AutomationRule,
} from '@/lib/automation-store'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { createIncident, saveIncident } from '@/lib/incident-store'

function toLegacyRule(r: AutomationRule, lastStatus?: 'success' | 'failure' | 'skipped') {
  const uiAction = r.action.type === 'webhook'
    ? 'call_webhook'
    : r.action.type === 'send_alert'
      ? 'send_email'
      : r.action.type === 'update_stats'
        ? 'trigger_backup'
        : r.action.type

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    triggerType: r.trigger.type,
    triggerConfig: {
      metric: r.trigger.metric,
      threshold: r.trigger.threshold,
      condition: r.trigger.condition,
      cronExpr: r.trigger.schedule,
    },
    actionType: uiAction,
    actionConfig: {
      sql: r.action.sql,
      webhookUrl: r.action.webhookUrl,
      message: r.action.message,
    },
    connectionId: r.connectionId,
    connectionName: loadConnections().find(c => c.id === r.connectionId)?.name ?? '',
    lastRun: r.lastRun,
    lastStatus,
    runCount: r.runCount,
    createdAt: r.createdAt,
  }
}

async function executeRule(rule: AutomationRule) {
  const startedAt = new Date().toISOString()
  const runBase = {
    id: newRunId(),
    ruleId: rule.id,
    ruleName: rule.name,
    startedAt,
  }

  try {
    if (!rule.enabled) {
      addRun({ ...runBase, completedAt: new Date().toISOString(), status: 'skipped', output: 'Rule disabled' })
      return { ok: true, status: 'skipped' as const }
    }

    let output = ''
    if (rule.action.type === 'run_sql') {
      const connId = rule.action.connectionId ?? rule.connectionId
      const conn = loadConnections().find(c => c.id === connId)
      if (!conn) throw new Error('Connection not found for SQL action')
      const rows = await queryErp(conn, rule.action.sql ?? 'SELECT CURRENT_TIMESTAMP FROM DUMMY')
      output = `Executed SQL. Rows returned: ${rows.length}`
    } else if (rule.action.type === 'create_incident') {
      const inc = createIncident({
        title: rule.action.message || `Automation incident: ${rule.name}`,
        description: `Triggered by automation rule ${rule.id}`,
        severity: 'medium',
        status: 'open',
        connectionId: rule.connectionId,
        connectionName: loadConnections().find(c => c.id === rule.connectionId)?.name,
        assignee: undefined,
        tags: ['automation'],
      })
      saveIncident(inc)
      output = `Incident created: ${inc.id}`
    } else if (rule.action.type === 'webhook') {
      const url = rule.action.webhookUrl
      if (!url) throw new Error('Webhook URL missing')
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 8000)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'vynsap',
            ruleId: rule.id,
            ruleName: rule.name,
            at: new Date().toISOString(),
          }),
          signal: controller.signal,
        })
        output = `Webhook status: ${res.status}`
      } finally {
        clearTimeout(t)
      }
    } else {
      output = `Action ${rule.action.type} executed as simulated operation`
    }

    addRun({ ...runBase, completedAt: new Date().toISOString(), status: 'success', output })
    return { ok: true, status: 'success' as const, output }
  } catch (e) {
    const msg = (e as Error).message
    addRun({ ...runBase, completedAt: new Date().toISOString(), status: 'failure', error: msg })
    return { ok: false, status: 'failure' as const, error: msg }
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const rules = loadRules()
  const runs = loadRuns()
  const latestRunByRule = new Map<string, (typeof runs)[number]>()
  for (const run of runs) {
    if (!latestRunByRule.has(run.ruleId)) latestRunByRule.set(run.ruleId, run)
  }

  const enrichedRuns = runs.map(run => {
    const rule = rules.find(r => r.id === run.ruleId)
    const connectionName = rule?.connectionId
      ? loadConnections().find(c => c.id === rule.connectionId)?.name ?? ''
      : ''
    return {
      ...run,
      connectionName,
      actionType: rule?.action.type,
      triggerType: rule?.trigger.type,
    }
  })

  const now = Date.now()
  const runs24h = runs.filter(r => now - new Date(r.startedAt).getTime() < 24 * 3600 * 1000)
  const success24h = runs24h.filter(r => r.status === 'success').length

  let rollback24h = 0
  for (const fail of runs24h.filter(r => r.status === 'failure')) {
    const failAt = new Date(fail.startedAt).getTime()
    const recovered = runs24h.some(r =>
      r.ruleId === fail.ruleId &&
      r.status === 'success' &&
      new Date(r.startedAt).getTime() > failAt &&
      new Date(r.startedAt).getTime() - failAt <= 30 * 60 * 1000
    )
    if (recovered) rollback24h += 1
  }

  const successRate24h = runs24h.length === 0 ? 100 : (success24h / runs24h.length) * 100
  const rollbackRate24h = runs24h.length === 0 ? 0 : (rollback24h / runs24h.length) * 100

  return NextResponse.json({
    rules: rules.map(rule => toLegacyRule(rule, latestRunByRule.get(rule.id)?.status)),
    runs: enrichedRuns,
    stats: {
      enabled: rules.filter(r => r.enabled).length,
      disabled: rules.filter(r => !r.enabled).length,
      failures24h: runs.filter(r => r.status === 'failure' && Date.now() - new Date(r.startedAt).getTime() < 24 * 3600 * 1000).length,
      runs24h: runs24h.length,
      successRate24h: Number(successRate24h.toFixed(2)),
      rollback24h,
      rollbackRate24h: Number(rollbackRate24h.toFixed(2)),
    },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()

  const incomingAction = String(body.actionType ?? 'run_sql')
  const normalizedAction = incomingAction === 'call_webhook'
    ? 'webhook'
    : incomingAction === 'send_email'
      ? 'send_alert'
      : incomingAction === 'trigger_backup'
        ? 'update_stats'
        : incomingAction

  const rule: AutomationRule = {
    id: newRuleId(),
    name: body.name,
    description: body.description ?? '',
    enabled: body.enabled ?? true,
    trigger: {
      type: body.triggerType ?? 'schedule',
      schedule: body.triggerConfig?.cronExpr,
      condition: body.triggerConfig?.condition,
      threshold: body.triggerConfig?.threshold,
      metric: body.triggerConfig?.metric,
    },
    action: {
      type: normalizedAction as AutomationRule['action']['type'],
      sql: body.actionConfig?.sql,
      webhookUrl: body.actionConfig?.webhookUrl,
      message: body.actionConfig?.message,
      connectionId: body.connectionId,
    },
    connectionId: body.connectionId,
    runCount: 0,
    createdAt: new Date().toISOString(),
  }

  saveRule(rule)
  return NextResponse.json(toLegacyRule(rule), { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()

  const id = String(body.id ?? '')
  const rules = loadRules()
  const idx = rules.findIndex(r => r.id === id)
  if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'toggle') {
    rules[idx] = { ...rules[idx], enabled: !rules[idx].enabled }
    saveRule(rules[idx])
    return NextResponse.json(toLegacyRule(rules[idx], loadRuns().find(r => r.ruleId === rules[idx].id)?.status))
  }

  if (body.action === 'run') {
    const result = await executeRule(rules[idx])
    const latest = loadRuns()[0]
    const updated = { ...rules[idx], lastRun: new Date().toISOString(), runCount: rules[idx].runCount + 1 }
    saveRule(updated)
    return NextResponse.json({
      ...result,
      rule: toLegacyRule(updated, latest.status),
      run: latest,
    })
  }

  const updated = {
    ...rules[idx],
    ...body,
  }
  saveRule(updated)
  return NextResponse.json(toLegacyRule(updated, loadRuns().find(r => r.ruleId === updated.id)?.status))
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, 'admin')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteRule(id)
  return NextResponse.json({ ok: true })
}
