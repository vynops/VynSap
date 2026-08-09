'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { Phone, Plus, User, Loader2, RefreshCw, Siren, Trash2, X } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type OnCallMember = { id: string; name: string; email: string; timezone: string }
type OnCallSchedule = {
  id: string
  name: string
  rotation: string
  members: OnCallMember[]
  currentOnCall?: string
}
type EscalationEvent = {
  id: string
  at: string
  scheduleName?: string
  escalatedTo: string
  incidentId?: string
  reason: string
  resolved: boolean
}

export default function OncallPage() {
  const { data, mutate } = useSWR('/api/oncall', fetcher, { refreshInterval: 15000 })
  const { data: incidents } = useSWR('/api/incidents', fetcher, { refreshInterval: 15000 })

  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    rotation: 'weekly',
    membersText: 'Alex DBA|alex@company.com|UTC\nPriya DBA|priya@company.com|UTC+5:30',
  })

  const schedules: OnCallSchedule[] = Array.isArray(data?.schedules) ? data.schedules : []
  const escalations: EscalationEvent[] = Array.isArray(data?.escalations) ? data.escalations : []
  const stats = data?.stats ?? { scheduleCount: schedules.length, openEscalations: 0, memberCount: 0 }
  const openIncidents = Array.isArray(incidents)
    ? incidents.filter((i: { status: string }) => i.status === 'open' || i.status === 'investigating')
    : []

  const activeCoveragePct = stats.scheduleCount > 0
    ? Math.round((schedules.filter((s: { currentOnCall?: string }) => !!s.currentOnCall).length / stats.scheduleCount) * 100)
    : 0
  const escalation24h = escalations.filter((e: { at: string }) => Date.now() - new Date(e.at).getTime() < 24 * 3600 * 1000).length
  const respondersPerSchedule = stats.scheduleCount > 0 ? (stats.memberCount / stats.scheduleCount) : 0

  const incidentById = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>()
    for (const i of openIncidents) map.set(i.id, i)
    return map
  }, [openIncidents])

  async function rotate(scheduleId: string) {
    setWorkingId(scheduleId)
    await fetch(`/api/oncall/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rotate' }),
    })
    setWorkingId(null)
    mutate()
  }

  async function escalate(scheduleId: string) {
    const incidentId = openIncidents[0]?.id
    setWorkingId(scheduleId)
    await fetch(`/api/oncall/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'escalate',
        incidentId,
        reason: incidentId ? `Escalated for incident ${incidentId}` : 'Manual escalation from on-call page',
      }),
    })
    setWorkingId(null)
    mutate()
  }

  async function removeSchedule(scheduleId: string) {
    if (!confirm('Delete this on-call schedule?')) return
    setWorkingId(scheduleId)
    await fetch(`/api/oncall/${scheduleId}`, { method: 'DELETE' })
    setWorkingId(null)
    mutate()
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const members = form.membersText
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const [name, email, timezone] = line.split('|').map(s => s.trim())
        return {
          id: `m-${idx + 1}`,
          name: name || `Member ${idx + 1}`,
          email: email || `member${idx + 1}@example.com`,
          timezone: timezone || 'UTC',
        }
      })

    await fetch('/api/oncall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        rotation: form.rotation,
        members,
        escalation: members,
        currentOnCall: members[0]?.id,
      }),
    })
    setSaving(false)
    setShowAdd(false)
    setForm({
      name: '',
      rotation: 'weekly',
      membersText: 'Alex DBA|alex@company.com|UTC\nPriya DBA|priya@company.com|UTC+5:30',
    })
    mutate()
  }

  function currentMember(s: { currentOnCall?: string; members: Array<{ id: string; name: string; email: string }> }) {
    return s.members.find(m => m.id === s.currentOnCall) ?? s.members[0]
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">On-Call Schedules</h2>
          <p className="text-sm text-slate-400 mt-0.5">Live rotations, escalations, and incident response coverage</p>
          <p className="text-[11px] text-slate-600 mt-1">{stats.scheduleCount} schedules · {stats.memberCount} responders · {stats.openEscalations} open escalations</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Schedule
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-white">{stats.scheduleCount}</div>
          <div className="text-xs text-slate-500">Schedules</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-blue-400">{activeCoveragePct}%</div>
          <div className="text-xs text-slate-500">Coverage Active</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className={cn('text-xl font-black', stats.openEscalations > 0 ? 'text-yellow-400' : 'text-emerald-400')}>{stats.openEscalations}</div>
          <div className="text-xs text-slate-500">Open Escalations</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-purple-400">{respondersPerSchedule.toFixed(1)}</div>
          <div className="text-xs text-slate-500">Responders/Schedule</div>
        </div>
      </div>

      <div className="rounded-xl bg-[#0f1629] border border-slate-800 px-4 py-3 text-xs text-slate-400">
        <span className="font-semibold text-slate-300">Operational Pulse:</span> {openIncidents.length} active incidents · {escalation24h} escalations in last 24h.
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-10 text-center">
          <Phone className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm mb-2">No on-call schedules yet.</p>
                <p className="text-slate-600 text-xs">Create schedules to manage DBA rotations for your ERP systems.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {schedules.map(s => (
            <div key={s.id} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white">{s.name}</h3>
                <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 rounded-full px-2 py-0.5 capitalize">{s.rotation}</span>
              </div>

              {currentMember(s) && (
                <div className="flex items-center gap-2 mb-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-400">Currently On-Call</div>
                    <div className="text-sm text-white">{currentMember(s)?.name}</div>
                    <div className="text-[10px] text-slate-500">{currentMember(s)?.email}</div>
                  </div>
                </div>
              )}

              <div className="flex gap-1 mb-3">
                <button onClick={() => rotate(s.id)} disabled={workingId === s.id}
                  className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-2 py-1 hover:bg-blue-500/30 transition-colors flex items-center gap-1">
                  {workingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Rotate
                </button>
                <button onClick={() => escalate(s.id)} disabled={workingId === s.id}
                  className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded px-2 py-1 hover:bg-yellow-500/30 transition-colors flex items-center gap-1">
                  <Siren className="w-3 h-3" /> Escalate
                </button>
                <button onClick={() => removeSchedule(s.id)} disabled={workingId === s.id}
                  className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/30 transition-colors flex items-center gap-1 ml-auto">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>

              <div className="space-y-2">
                {s.members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 text-xs">
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 font-bold text-[10px] flex-shrink-0">
                      {m.name.charAt(0)}
                    </div>
                    <span className="text-slate-300 flex-1">{m.name}</span>
                    <span className="text-slate-500">{m.email}</span>
                    <span className="text-slate-600">{m.timezone}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">Recent Escalations</span>
          <span className="text-[10px] text-slate-600">{escalations.length} events</span>
        </div>
        {escalations.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500 text-center">No escalations yet.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {escalations.slice(0, 10).map(e => (
              <div key={e.id} className="px-4 py-3 text-xs">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5', e.resolved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400')}>
                    {e.resolved ? 'resolved' : 'open'}
                  </span>
                  <span className="text-slate-300 font-semibold">{e.scheduleName ?? 'Schedule'}</span>
                  <span className="text-slate-600">{timeAgo(e.at)}</span>
                </div>
                <div className="text-slate-400">Escalated to {e.escalatedTo}</div>
                <div className="text-slate-500">{e.reason}</div>
                {e.incidentId && incidentById.get(e.incidentId) && (
                  <div className="text-blue-400 mt-0.5">Linked incident: {incidentById.get(e.incidentId)?.title}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1629] border border-slate-700 rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white">Create On-Call Schedule</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Schedule Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="Primary DBA Rotation" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Rotation</label>
                <select value={form.rotation} onChange={e => setForm(p => ({ ...p, rotation: e.target.value }))}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Members (one per line: name|email|timezone)</label>
                <textarea value={form.membersText} onChange={e => setForm(p => ({ ...p, membersText: e.target.value }))} rows={5}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
