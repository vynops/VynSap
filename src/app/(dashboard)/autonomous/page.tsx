'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Brain, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const IMPACT_COLOR: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-500/20 text-slate-400',
  approved: 'bg-blue-500/20 text-blue-400',
  rejected: 'bg-red-500/20 text-red-400',
  applied: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
}

export default function AutonomousPage() {
  const { data, mutate } = useSWR('/api/autonomous', fetcher)
  const [generating, setGenerating] = useState(false)
  const [filter, setFilter] = useState('all')
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const proposals = Array.isArray(data) ? data : []
  const filtered = proposals.filter((p: { status: string }) => filter === 'all' || p.status === filter)
  const pendingCount = proposals.filter((p: { status: string }) => p.status === 'pending').length
  const approvedCount = proposals.filter((p: { status: string }) => p.status === 'approved').length
  const appliedCount = proposals.filter((p: { status: string }) => p.status === 'applied').length
  const failedCount = proposals.filter((p: { status: string }) => p.status === 'failed').length
  const highImpact = proposals.filter((p: { impact: string }) => p.impact === 'critical' || p.impact === 'high').length

  async function generate() {
    setGenerating(true)
    setError('')
    await fetch('/api/autonomous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    })
    setGenerating(false)
    mutate()
  }

  async function act(id: string, action: 'approve' | 'reject' | 'apply') {
    setWorkingId(id)
    setError('')
    const res = await fetch(`/api/autonomous/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: 'Operation failed' }))
      setError(String(d.error ?? 'Operation failed'))
    }
    setWorkingId(null)
    mutate()
  }

  async function remove(id: string) {
    if (!confirm('Delete this proposal?')) return
    setWorkingId(id)
    setError('')
    const res = await fetch(`/api/autonomous/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: 'Delete failed' }))
      setError(String(d.error ?? 'Delete failed'))
    }
    setWorkingId(null)
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Autonomous Ops</h2>
          <p className="text-sm text-slate-400 mt-0.5">AI-generated optimization proposals for SAP ERP databases</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1">
            {['all', 'pending', 'approved', 'applied'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={cn('px-2.5 py-1 text-xs font-semibold rounded-md transition-colors capitalize',
                  filter === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                )}>{s}</button>
            ))}
          </div>
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {generating ? 'Analyzing…' : 'Generate Proposals'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-yellow-400">{pendingCount}</div>
          <div className="text-xs text-slate-500">Pending</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-blue-400">{approvedCount}</div>
          <div className="text-xs text-slate-500">Approved</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-emerald-400">{appliedCount}</div>
          <div className="text-xs text-slate-500">Applied</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className={cn('text-xl font-black', failedCount > 0 ? 'text-red-400' : 'text-slate-300')}>{failedCount}</div>
          <div className="text-xs text-slate-500">Failed</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-orange-400">{highImpact}</div>
          <div className="text-xs text-slate-500">High Impact</div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-10 text-center">
          <Brain className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No proposals yet. Click "Generate Proposals" to analyze your ERP systems.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p: {
            id: string; title: string; description: string; category: string
            impact: string; effort: string; status: string; expectedGain: string
            riskLevel: string; aiReasoning: string; sql?: string
          }) => (
            <div key={p.id} className={cn('rounded-2xl bg-[#0f1629] border p-5', IMPACT_COLOR[p.impact]?.split(' ')[2] ?? 'border-slate-800')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5 border', IMPACT_COLOR[p.impact] ?? '')}>{p.impact} impact</span>
                    <span className="text-[10px] font-bold bg-slate-700 text-slate-300 rounded-full px-2 py-0.5">{p.category}</span>
                    <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5', STATUS_COLOR[p.status] ?? '')}>{p.status}</span>
                    <span className="text-[10px] text-slate-500">Risk: {p.riskLevel}</span>
                  </div>
                  <h3 className="font-bold text-white text-sm mb-1">{p.title}</h3>
                  <p className="text-xs text-slate-400 mb-2">{p.description}</p>
                  {p.expectedGain && (
                    <p className="text-xs text-emerald-400 font-semibold">Expected gain: {p.expectedGain}</p>
                  )}
                  {p.aiReasoning && (
                    <p className="text-xs text-slate-500 mt-1 italic">{p.aiReasoning}</p>
                  )}
                  {p.sql && (
                    <div className="mt-2 bg-slate-900 rounded-lg p-2 font-mono text-[10px] text-slate-300 overflow-x-auto">
                      {p.sql}
                    </div>
                  )}
                </div>
                {p.status === 'pending' && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => act(p.id, 'approve')} disabled={workingId === p.id}
                      className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-2 py-1 hover:bg-blue-500/30 transition-colors">
                      Approve
                    </button>
                    <button onClick={() => act(p.id, 'reject')} disabled={workingId === p.id}
                      className="text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded px-2 py-1 hover:bg-slate-500/30 transition-colors">
                      Dismiss
                    </button>
                    <button onClick={() => remove(p.id)} disabled={workingId === p.id}
                      className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/30 transition-colors">
                      Delete
                    </button>
                  </div>
                )}
                {p.status === 'approved' && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => act(p.id, 'apply')} disabled={workingId === p.id}
                    className="flex-shrink-0 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-2 py-1.5 hover:bg-emerald-500/30 transition-colors">
                      Apply Now
                    </button>
                    <button onClick={() => remove(p.id)} disabled={workingId === p.id}
                      className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/30 transition-colors">
                      Delete
                    </button>
                  </div>
                )}
                {(p.status === 'rejected' || p.status === 'failed' || p.status === 'applied') && (
                  <button onClick={() => remove(p.id)} disabled={workingId === p.id}
                    className="flex-shrink-0 text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-1.5 hover:bg-red-500/30 transition-colors">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
