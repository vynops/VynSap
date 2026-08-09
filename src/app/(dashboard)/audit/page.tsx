'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { ClipboardList, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const ACTION_COLOR: Record<string, string> = {
  approve_proposal: 'text-emerald-400', reject_proposal: 'text-red-400',
  apply_proposal: 'text-purple-400', delete_proposal: 'text-slate-400',
  generate_proposals: 'text-blue-400', create_rule: 'text-blue-400',
  run_rule: 'text-yellow-400', delete_rule: 'text-red-400',
  create_incident: 'text-orange-400', update_incident: 'text-yellow-400',
  delete_incident: 'text-red-400', approve_transport: 'text-emerald-400',
  reject_transport: 'text-red-400', apply_transport: 'text-purple-400',
  create_transport: 'text-blue-400', copilot_query: 'text-sky-400',
  scheduler_fire: 'text-teal-400', update_settings: 'text-slate-400',
}

interface AuditEntry {
  id: string; ts: string; actor: string; actorRole: string; action: string
  resource: string; resourceId?: string; detail?: string; outcome: string
}

export default function AuditPage() {
  const { data } = useSWR<AuditEntry[]>('/api/audit?limit=200', fetcher, { refreshInterval: 30000 })
  const [filter, setFilter] = useState('')

  const entries = Array.isArray(data) ? data : []
  const filtered = filter ? entries.filter(e => e.action.includes(filter) || e.actor.includes(filter) || e.resource.includes(filter)) : entries
  const successCount = entries.filter(e => e.outcome === 'success').length
  const failureCount = entries.filter(e => e.outcome === 'failure').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold text-white">Audit Log</h1>
        <p className="text-sm text-slate-400 mt-0.5">Immutable record of all actions across incidents, automation, autonomous ops, transports, and copilot</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[{ label: 'Total Events', value: entries.length, color: 'text-white', Icon: ClipboardList },
          { label: 'Successful', value: successCount, color: 'text-emerald-400', Icon: CheckCircle2 },
          { label: 'Failures', value: failureCount, color: 'text-red-400', Icon: XCircle },
          { label: 'Actors', value: new Set(entries.map(e => e.actor)).size, color: 'text-blue-400', Icon: ClipboardList }].map(({ label, value, color, Icon }) => (
          <div key={label} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
            <Icon className={cn('w-5 h-5 mb-3', color)} />
            <div className={cn('text-2xl font-black', color)}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
          </div>
        ))}
      </div>

      <div>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by action, actor, or resource…" className="w-full max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
      </div>

      <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-4 py-3 text-left text-slate-500 font-medium">Time</th>
                <th className="px-4 py-3 text-left text-slate-500 font-medium">Actor</th>
                <th className="px-4 py-3 text-left text-slate-500 font-medium">Action</th>
                <th className="px-4 py-3 text-left text-slate-500 font-medium">Resource</th>
                <th className="px-4 py-3 text-left text-slate-500 font-medium">Detail</th>
                <th className="px-4 py-3 text-left text-slate-500 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No audit entries yet.</td></tr>
              )}
              {filtered.map(e => (
                <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{new Date(e.ts).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-white font-medium whitespace-nowrap">{e.actor}<span className="text-slate-500 font-normal ml-1">({e.actorRole})</span></td>
                  <td className={cn('px-4 py-2.5 font-mono whitespace-nowrap', ACTION_COLOR[e.action] ?? 'text-slate-400')}>{e.action}</td>
                  <td className="px-4 py-2.5 text-slate-400">{e.resource}{e.resourceId ? <span className="text-slate-600 ml-1">#{e.resourceId.slice(-6)}</span> : null}</td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate" title={e.detail}>{e.detail}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('px-2 py-0.5 rounded-full', e.outcome === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>{e.outcome}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
