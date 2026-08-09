'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Package, Plus, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const RISK_COLOR: Record<string, string> = {
  safe: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  low:  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300', review: 'bg-blue-500/20 text-blue-400',
  approved: 'bg-emerald-500/20 text-emerald-400', rejected: 'bg-red-500/20 text-red-400',
  released: 'bg-purple-500/20 text-purple-400', imported: 'bg-teal-500/20 text-teal-400',
}

interface Transport {
  id: string; number: string; description: string; type: string; status: string
  targetSystem: string; owner: string; objects: string[]; aiRisk: string; aiReview: string; aiImpact: string
  approvedBy?: string; releasedBy?: string; createdAt: string
}

export default function TransportPage() {
  const { data, mutate } = useSWR<Transport[]>('/api/transport', fetcher)
  const [showForm, setShowForm] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [form, setForm] = useState({ description: '', type: 'customizing', targetSystem: 'PRODUCTION', objects: '' })
  const [error, setError] = useState('')

  const transports = Array.isArray(data) ? data : []
  const pending   = transports.filter(t => t.status === 'review').length
  const approved  = transports.filter(t => t.status === 'approved').length
  const released  = transports.filter(t => t.status === 'released').length
  const highRisk  = transports.filter(t => t.aiRisk === 'high' || t.aiRisk === 'critical').length

  async function submit() {
    if (!form.description) return
    setWorking('create'); setError('')
    const res = await fetch('/api/transport', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, objects: form.objects.split('\n').map(s => s.trim()).filter(Boolean) }),
    })
    if (res.ok) { setShowForm(false); setForm({ description: '', type: 'customizing', targetSystem: 'PRODUCTION', objects: '' }) }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Failed') }
    setWorking(null); mutate()
  }

  async function act(id: string, action: string) {
    setWorking(id); setError('')
    const res = await fetch('/api/transport', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Failed') }
    setWorking(null); mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Transport Governance</h1>
          <p className="text-sm text-slate-400 mt-0.5">AI-reviewed SAP transport requests with approval workflow</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New Transport
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[{ label: 'Pending Review', value: pending, color: 'text-yellow-400', Icon: Clock },
          { label: 'Approved', value: approved, color: 'text-emerald-400', Icon: CheckCircle2 },
          { label: 'Released', value: released, color: 'text-purple-400', Icon: Package },
          { label: 'High Risk', value: highRisk, color: 'text-red-400', Icon: ShieldAlert }].map(({ label, value, color, Icon }) => (
          <div key={label} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
            <Icon className={cn('w-5 h-5 mb-3', color)} />
            <div className={cn('text-2xl font-black', color)}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>}

      {showForm && (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-700 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Submit Transport for AI Review</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Description *</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What does this transport change?" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="customizing">Customizing</option>
                <option value="workbench">Workbench</option>
                <option value="transport-of-copies">Transport of Copies</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Target System</label>
              <input value={form.targetSystem} onChange={e => setForm(p => ({ ...p, targetSystem: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Objects (one per line)</label>
            <textarea value={form.objects} onChange={e => setForm(p => ({ ...p, objects: e.target.value }))} rows={3} placeholder="PROG: Z_MY_PROGRAM&#10;TABD: ZCONFIG_TABLE" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={submit} disabled={working === 'create'} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              {working === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Submit for AI Review
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {transports.length === 0 && <div className="text-center py-12 text-slate-500 text-sm">No transports yet — submit one above.</div>}
        {transports.map(t => (
          <div key={t.id} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5 hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs text-slate-400">{t.number}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', STATUS_COLOR[t.status] ?? '')}>{t.status}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border', RISK_COLOR[t.aiRisk] ?? '')}>{t.aiRisk} risk</span>
                  <span className="text-xs text-slate-500">{t.type}</span>
                </div>
                <div className="text-sm font-medium text-white mb-2">{t.description}</div>
                {t.aiReview && <p className="text-xs text-slate-400 mb-1">{t.aiReview}</p>}
                {t.aiImpact && <p className="text-xs text-slate-500 italic">{t.aiImpact}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                  <span>Owner: {t.owner}</span>
                  <span>Target: {t.targetSystem}</span>
                  {t.approvedBy && <span>Approved by: {t.approvedBy}</span>}
                  <span>{new Date(t.createdAt).toLocaleString()}</span>
                </div>
                {t.objects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.objects.slice(0, 6).map((o, i) => <span key={i} className="text-xs bg-slate-800 text-slate-400 rounded px-1.5 py-0.5 font-mono">{o}</span>)}
                    {t.objects.length > 6 && <span className="text-xs text-slate-500">+{t.objects.length - 6} more</span>}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {t.status === 'review' && (
                  <>
                    <button onClick={() => act(t.id, 'approve')} disabled={working === t.id} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs rounded-lg border border-emerald-500/30 transition-colors disabled:opacity-50">
                      {working === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve
                    </button>
                    <button onClick={() => act(t.id, 'reject')} disabled={working === t.id} className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded-lg border border-red-500/30 transition-colors disabled:opacity-50">
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  </>
                )}
                {t.status === 'approved' && (
                  <button onClick={() => act(t.id, 'release')} disabled={working === t.id} className="flex items-center gap-1 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-xs rounded-lg border border-purple-500/30 transition-colors disabled:opacity-50">
                    {working === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />} Release
                  </button>
                )}
                {t.status === 'released' && (
                  <button onClick={() => act(t.id, 'import')} disabled={working === t.id} className="flex items-center gap-1 px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 text-xs rounded-lg border border-teal-500/30 transition-colors disabled:opacity-50">
                    {working === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Import
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
