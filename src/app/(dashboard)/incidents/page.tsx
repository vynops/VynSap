'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { AlertTriangle, Plus, X, Loader2, MessageSquarePlus, Trash2 } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const SEV_COLOR: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

export default function IncidentsPage() {
  const { data, mutate } = useSWR('/api/incidents?includeKpis=1', fetcher, { refreshInterval: 20000 })
  const { data: conns } = useSWR('/api/connections', fetcher)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium', assignee: '', connectionId: '' })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  const incidents = Array.isArray(data?.incidents) ? data.incidents : []
  const incidentKpis = data?.kpis
  const connList = Array.isArray(conns) ? conns : []
  const filtered = incidents.filter((i: { status: string }) => statusFilter === 'all' || i.status === statusFilter)

  const openCount = incidents.filter((i: { status: string }) => i.status === 'open').length
  const investigatingCount = incidents.filter((i: { status: string }) => i.status === 'investigating').length
  const criticalOpen = incidents.filter((i: { status: string; severity: string }) => i.status !== 'resolved' && i.status !== 'closed' && i.severity === 'critical').length
  const resolved = incidents.filter((i: { resolvedAt?: string }) => !!i.resolvedAt)
  const avgResolveHours = resolved.length === 0 ? 0 : (
    resolved.reduce((n: number, i: { createdAt: string; resolvedAt: string }) => n + Math.max(0, new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime()), 0)
    / resolved.length / 3600000
  )
  const mttrHours = Number(incidentKpis?.summary?.mttrHours ?? avgResolveHours)
  const mttdMins = Number(incidentKpis?.summary?.mttdMins ?? 0)
  const activeBusinessImpact = Number(incidentKpis?.summary?.activeBusinessImpact ?? 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        connectionName: connList.find((c: { id: string }) => c.id === form.connectionId)?.name,
      }),
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ title: '', description: '', severity: 'medium', assignee: '', connectionId: '' })
    mutate()
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/incidents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    mutate()
  }

  async function addNote(id: string) {
    if (!noteText.trim()) return
    await fetch(`/api/incidents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteText.trim() }),
    })
    setNoteText('')
    setNoteFor(null)
    mutate()
  }

  async function removeIncident(id: string) {
    if (!confirm('Delete this incident?')) return
    await fetch(`/api/incidents/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Incident Management</h2>
          <p className="text-sm text-slate-400 mt-0.5">{incidents.filter((i: { status: string }) => i.status === 'open').length} open · {incidents.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1">
            {['all', 'open', 'investigating', 'resolved'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-2.5 py-1 text-xs font-semibold rounded-md transition-colors capitalize',
                  statusFilter === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                )}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Incident
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-red-400">{openCount}</div>
          <div className="text-xs text-slate-500">Open Incidents</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-yellow-400">{investigatingCount}</div>
          <div className="text-xs text-slate-500">Investigating</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className={cn('text-xl font-black', criticalOpen > 0 ? 'text-red-400' : 'text-emerald-400')}>{criticalOpen}</div>
          <div className="text-xs text-slate-500">Critical Active</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-blue-400">{mttrHours.toFixed(1)}h</div>
          <div className="text-xs text-slate-500">MTTR (30d)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4">
          <div className="text-[11px] text-slate-500">MTTD</div>
          <div className="text-lg font-black text-yellow-400 mt-1">{mttdMins.toFixed(1)}m</div>
          <div className="text-[10px] text-slate-600 mt-1">Mean time to detect (30d)</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4">
          <div className="text-[11px] text-slate-500">Active Business Impact Score</div>
          <div className={cn('text-lg font-black mt-1', activeBusinessImpact >= 220 ? 'text-red-400' : activeBusinessImpact >= 100 ? 'text-yellow-400' : 'text-emerald-400')}>
            {activeBusinessImpact}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">Aggregated impact of unresolved incidents</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No incidents {statusFilter !== 'all' ? `with status "${statusFilter}"` : ''}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inc: {
            id: string; title: string; description: string; severity: string
            status: string; assignee: string; createdAt: string; connectionName: string; businessImpactScore?: number
          }) => (
            <div key={inc.id} className={cn('rounded-2xl bg-[#0f1629] border p-5', SEV_COLOR[inc.severity]?.split(' ')[2] ?? 'border-slate-800')}>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5 border', SEV_COLOR[inc.severity] ?? SEV_COLOR.low)}>
                      {inc.severity}
                    </span>
                    <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5',
                      inc.status === 'open' ? 'bg-red-500/20 text-red-400' :
                      inc.status === 'investigating' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-emerald-500/20 text-emerald-400'
                    )}>{inc.status}</span>
                    <span className="text-xs text-slate-500">{timeAgo(inc.createdAt)}</span>
                    <span className={cn(
                      'text-[10px] font-bold rounded-full px-2 py-0.5',
                      Number(inc.businessImpactScore ?? 0) >= 80 ? 'bg-red-500/20 text-red-400' :
                      Number(inc.businessImpactScore ?? 0) >= 55 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-emerald-500/20 text-emerald-400'
                    )}>
                      Impact {Math.round(Number(inc.businessImpactScore ?? 0))}
                    </span>
                  </div>
                  <h3 className="font-bold text-white text-sm">{inc.title}</h3>
                  {inc.description && <p className="text-xs text-slate-400 mt-1">{inc.description}</p>}
                  {(inc.assignee || inc.connectionName) && (
                    <div className="flex gap-3 mt-2 text-xs text-slate-500">
                      {inc.assignee && <span>Assignee: {inc.assignee}</span>}
                      {inc.connectionName && <span>System: {inc.connectionName}</span>}
                    </div>
                  )}
                </div>
                {inc.status === 'open' && (
                  <div className="flex gap-1">
                    <button onClick={() => updateStatus(inc.id, 'investigating')}
                      className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded px-2 py-1 hover:bg-yellow-500/30 transition-colors">
                      Investigate
                    </button>
                    <button onClick={() => updateStatus(inc.id, 'resolved')}
                      className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-2 py-1 hover:bg-emerald-500/30 transition-colors">
                      Resolve
                    </button>
                    <button onClick={() => setNoteFor(noteFor === inc.id ? null : inc.id)}
                      className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-2 py-1 hover:bg-blue-500/30 transition-colors flex items-center gap-1">
                      <MessageSquarePlus className="w-3 h-3" /> Note
                    </button>
                  </div>
                )}
                {inc.status === 'investigating' && (
                  <div className="flex gap-1">
                    <button onClick={() => updateStatus(inc.id, 'resolved')}
                      className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-2 py-1 hover:bg-emerald-500/30 transition-colors">
                      Resolve
                    </button>
                    <button onClick={() => setNoteFor(noteFor === inc.id ? null : inc.id)}
                      className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-2 py-1 hover:bg-blue-500/30 transition-colors flex items-center gap-1">
                      <MessageSquarePlus className="w-3 h-3" /> Note
                    </button>
                  </div>
                )}
                {(inc.status === 'resolved' || inc.status === 'closed') && (
                  <button onClick={() => removeIncident(inc.id)}
                    className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/30 transition-colors flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </div>

              {noteFor === inc.id && (
                <div className="mt-3 flex gap-2">
                  <input value={noteText} onChange={e => setNoteText(e.target.value)}
                    placeholder="Add investigation note"
                    className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
                  <button onClick={() => addNote(inc.id)}
                    className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2">
                    Add Note
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1629] border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white">New Incident</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Title *</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="ERP DB application server CPU spike" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Severity</label>
                <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">System</label>
                <select value={form.connectionId} onChange={e => setForm(p => ({ ...p, connectionId: e.target.value }))}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="">Unassigned</option>
                  {connList.map((c: { id: string; name: string }) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Describe the incident…" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Assignee</label>
                <input value={form.assignee} onChange={e => setForm(p => ({ ...p, assignee: e.target.value }))}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="DBA name or email" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
