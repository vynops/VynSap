'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Terminal, Plus, X, Loader2, Play, ToggleLeft, ToggleRight, Trash2, ChevronDown, ChevronRight, History } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function AutomationPage() {
  const { data, mutate } = useSWR('/api/automation', fetcher)
  const { data: conns } = useSWR('/api/connections', fetcher)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', triggerType: 'schedule', actionType: 'run_sql',
    cronExpr: '0 2 * * *', sql: '', webhookUrl: '', connectionId: '', connectionName: '',
  })
  const [saving, setSaving] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)

  const rules = Array.isArray(data?.rules) ? data.rules : []
  const runs = Array.isArray(data?.runs) ? data.runs : []
  const stats = data?.stats ?? { enabled: rules.filter((r: { enabled: boolean }) => r.enabled).length, disabled: 0, failures24h: 0 }
  const connList = Array.isArray(conns) ? conns : []
  const run24h = Number(stats.runs24h ?? runs.filter((r: { startedAt: string }) => Date.now() - new Date(r.startedAt).getTime() < 24 * 3600 * 1000).length)
  const successRate = Number(stats.successRate24h ?? (run24h > 0 ? Math.round((runs.filter((r: { status: string; startedAt: string }) => r.status === 'success' && Date.now() - new Date(r.startedAt).getTime() < 24 * 3600 * 1000).length / run24h) * 100) : 100))
  const rollbackRate = Number(stats.rollbackRate24h ?? 0)

  function runDuration(startedAt: string, completedAt: string) {
    const ms = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.round(ms / 60000)}m`
  }

  function recentRunsForRule(ruleId: string) {
    return runs.filter((run: { ruleId: string }) => run.ruleId === ruleId).slice(0, 6)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const conn = connList.find((c: { id: string }) => c.id === form.connectionId)
    await fetch('/api/automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, description: form.description,
        triggerType: form.triggerType, actionType: form.actionType,
        triggerConfig: { cronExpr: form.cronExpr },
        actionConfig: { sql: form.sql, webhookUrl: form.webhookUrl },
        connectionId: form.connectionId,
        connectionName: conn?.name ?? '',
      }),
    })
    setSaving(false)
    setShowAdd(false)
    setForm({
      name: '', description: '', triggerType: 'schedule', actionType: 'run_sql',
      cronExpr: '0 2 * * *', sql: '', webhookUrl: '', connectionId: '', connectionName: '',
    })
    mutate()
  }

  async function toggleRule(id: string) {
    setWorkingId(id)
    await fetch('/api/automation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'toggle' }),
    })
    setWorkingId(null)
    mutate()
  }

  async function runRule(id: string) {
    setWorkingId(id)
    await fetch('/api/automation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'run' }),
    })
    setWorkingId(null)
    mutate()
  }

  async function removeRule(id: string) {
    if (!confirm('Delete this rule?')) return
    setWorkingId(id)
    await fetch(`/api/automation?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setWorkingId(null)
    mutate()
  }

  const ACTION_COLOR: Record<string, string> = {
    run_sql: 'text-blue-400 bg-blue-500/10',
    send_email: 'text-yellow-400 bg-yellow-500/10',
    call_webhook: 'text-purple-400 bg-purple-500/10',
    create_incident: 'text-red-400 bg-red-500/10',
    trigger_backup: 'text-emerald-400 bg-emerald-500/10',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Automation Rules</h2>
          <p className="text-sm text-slate-400 mt-0.5">Scheduled and triggered automation for ERP operations</p>
          <p className="text-[11px] text-slate-600 mt-1">{stats.enabled} enabled · {stats.disabled} disabled · {stats.failures24h} failures (24h)</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Rule
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-emerald-400">{stats.enabled}</div>
          <div className="text-xs text-slate-500">Enabled Rules</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-blue-400">{run24h}</div>
          <div className="text-xs text-slate-500">Runs (24h)</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-purple-400">{successRate}%</div>
          <div className="text-xs text-slate-500">Success Rate</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className={cn('text-xl font-black', stats.failures24h > 0 ? 'text-red-400' : 'text-emerald-400')}>{stats.failures24h}</div>
          <div className="text-xs text-slate-500">Failures (24h)</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className={cn('text-xl font-black', rollbackRate > 8 ? 'text-red-400' : rollbackRate > 3 ? 'text-yellow-400' : 'text-emerald-400')}>
            {rollbackRate.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500">Rollback Rate</div>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-10 text-center">
          <Terminal className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No automation rules. Create rules to automate ERP database operations like delta merges, stats updates, or backups.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r: {
            id: string; name: string; description: string; enabled: boolean
            triggerType: string; actionType: string; connectionName: string; lastRun: string; lastStatus?: string
          }) => (
            <div key={r.id} className="overflow-hidden rounded-2xl bg-[#0f1629] border border-slate-800">
              <div className="flex items-center gap-3 p-5">
                <button onClick={() => toggleRule(r.id)} disabled={workingId === r.id}
                  className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                  title={r.enabled ? 'Disable rule' : 'Enable rule'}>
                  {workingId === r.id
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : r.enabled
                      ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                      : <ToggleLeft className="w-5 h-5" />}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white text-sm">{r.name}</span>
                    <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5', ACTION_COLOR[r.actionType] ?? 'text-slate-400 bg-slate-500/10')}>
                      {r.actionType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] font-bold bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">{r.triggerType}</span>
                    {r.connectionName && <span className="text-[10px] text-slate-500">{r.connectionName}</span>}
                  </div>
                  {r.description && <p className="text-xs text-slate-400">{r.description}</p>}
                  {r.lastRun && (
                    <p className="text-[10px] text-slate-600 mt-1">
                      Last run: {r.lastRun.slice(0, 16)}{r.lastStatus ? ` · ${r.lastStatus}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => runRule(r.id)} disabled={workingId === r.id}
                    className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-2 py-1 hover:bg-blue-500/30 transition-colors flex items-center gap-1">
                    {workingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run
                  </button>
                  <button onClick={() => setExpandedRuleId(expandedRuleId === r.id ? null : r.id)}
                    className="text-[10px] font-bold bg-slate-700 text-slate-200 rounded px-2 py-1 hover:bg-slate-600 transition-colors flex items-center gap-1">
                    <History className="w-3 h-3" /> History
                  </button>
                  <button onClick={() => removeRule(r.id)} disabled={workingId === r.id}
                    className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/30 transition-colors flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                  <button onClick={() => setExpandedRuleId(expandedRuleId === r.id ? null : r.id)}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                    title="Toggle run history">
                    {expandedRuleId === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {expandedRuleId === r.id && (
                <div className="border-t border-slate-800/60 bg-slate-950/25">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Run History</span>
                    <span className="ml-auto text-[10px] text-slate-600">{recentRunsForRule(r.id).length} recent</span>
                  </div>

                  {recentRunsForRule(r.id).length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500">No runs yet for this rule.</div>
                  ) : (
                    <div className="divide-y divide-slate-800/50">
                      {recentRunsForRule(r.id).map((run: {
                        id: string; ruleName: string; status: string; startedAt: string; completedAt: string
                        output?: string; error?: string; connectionName?: string; actionType?: string; triggerType?: string
                      }) => (
                        <div key={run.id} className="px-4 py-3 text-xs">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5', run.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : run.status === 'failure' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400')}>
                              {run.status}
                            </span>
                            <span className="text-slate-300 font-semibold">{timeAgo(run.startedAt)}</span>
                            <span className="text-slate-600">{runDuration(run.startedAt, run.completedAt)}</span>
                            {run.connectionName && <span className="text-slate-500">{run.connectionName}</span>}
                            {run.triggerType && <span className="rounded px-1.5 py-0.5 bg-slate-800 text-slate-400">{run.triggerType}</span>}
                            {run.actionType && <span className="rounded px-1.5 py-0.5 bg-slate-800 text-slate-400">{run.actionType}</span>}
                          </div>
                          <div className="text-slate-400">{run.output ?? run.error ?? 'No execution output recorded.'}</div>
                          {run.error && <div className="mt-1 text-red-400">Failure detail: {run.error}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1629] border border-slate-700 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white">New Automation Rule</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Rule Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="Nightly Delta Merge" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">ERP System</label>
                <select value={form.connectionId} onChange={e => setForm(p => ({ ...p, connectionId: e.target.value }))}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="">None</option>
                  {connList.map((c: { id: string; name: string }) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Trigger</label>
                  <select value={form.triggerType} onChange={e => setForm(p => ({ ...p, triggerType: e.target.value }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="schedule">Schedule</option>
                    <option value="alert">On Alert</option>
                    <option value="threshold">On Threshold</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Action</label>
                  <select value={form.actionType} onChange={e => setForm(p => ({ ...p, actionType: e.target.value }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="run_sql">Run SQL</option>
                    <option value="send_email">Send Email</option>
                    <option value="call_webhook">Call Webhook</option>
                    <option value="create_incident">Create Incident</option>
                    <option value="trigger_backup">Trigger Backup</option>
                  </select>
                </div>
              </div>
              {form.triggerType === 'schedule' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Cron Expression</label>
                  <input value={form.cronExpr} onChange={e => setForm(p => ({ ...p, cronExpr: e.target.value }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                    placeholder="0 2 * * *" />
                </div>
              )}
              {form.actionType === 'run_sql' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">SQL Statement</label>
                  <textarea value={form.sql} onChange={e => setForm(p => ({ ...p, sql: e.target.value }))} rows={4}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500 resize-none"
                    placeholder="MERGE DELTA OF SCHEMA.TABLE" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}Create Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
