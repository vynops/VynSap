'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Search, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function QueriesPage() {
  const { data, isLoading } = useSWR('/api/queries', fetcher, { refreshInterval: 30000 })
  const [filter, setFilter] = useState('')
  const rows = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Query Analyzer</h2>
          <p className="text-sm text-slate-400 mt-0.5">Top queries by total CPU time from M_SQL_PLAN_CACHE</p>
        </div>
        <div className="ml-auto relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter SQL…"
            className="bg-slate-800/60 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 w-52" />
        </div>
      </div>

      {rows.map((r: {
        connId: string; connName: string
        planCache: { PLAN_CACHE_HITS: number; PLAN_CACHE_MISSES: number; CACHE_SIZE_MB: number; PLAN_CACHE_EVICTIONS: number }
        stats: { TOTAL_CPU_MIN: number; TOTAL_EXECUTIONS: number; UNIQUE_STATEMENTS: number }
        expensive: Record<string, unknown>[]
      }) => {
        const pc = r.planCache ?? {}
        const st = r.stats ?? {}
        const hitRate = (Number(pc.PLAN_CACHE_HITS ?? 0) + Number(pc.PLAN_CACHE_MISSES ?? 0)) > 0
          ? ((Number(pc.PLAN_CACHE_HITS ?? 0) / (Number(pc.PLAN_CACHE_HITS ?? 0) + Number(pc.PLAN_CACHE_MISSES ?? 0))) * 100).toFixed(1)
          : '—'
        const filtered = (r.expensive ?? []).filter((q) =>
          !filter || String(q.SQL_TEXT ?? '').toLowerCase().includes(filter.toLowerCase()) ||
          String(q.USER_NAME ?? '').toLowerCase().includes(filter.toLowerCase())
        )
        return (
          <div key={r.connId} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>
            </div>
            {/* Plan cache summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Cache Hit Rate', value: `${hitRate}%`, color: 'text-emerald-400' },
                { label: 'Cache Size', value: `${Number(pc.CACHE_SIZE_MB ?? 0).toFixed(0)} MB`, color: 'text-blue-400' },
                { label: 'Total Executions', value: Number(st.TOTAL_EXECUTIONS ?? 0).toLocaleString(), color: 'text-white' },
                { label: 'Unique Statements', value: Number(st.UNIQUE_STATEMENTS ?? 0).toLocaleString(), color: 'text-slate-300' },
              ].map(s => (
                <div key={s.label} className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                  <div className={cn('text-xl font-black', s.color)}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400">Top SQL by CPU Time</span>
                <span className="ml-2 text-[10px] text-slate-600">{filtered.length} statements</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">SQL</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Total s</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Avg s</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Max s</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Count</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">User</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filtered.slice(0, 50).map((q, i) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 max-w-xs">
                          <div className="font-mono text-slate-300 truncate text-[10px]" title={String(q.SQL_TEXT ?? '')}>
                            {String(q.SQL_TEXT ?? '').slice(0, 80)}…
                          </div>
                          <div className="text-[9px] text-slate-600 mt-0.5">{String(q.STATEMENT_HASH ?? '')}</div>
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-white">{Number(q.TOTAL_SEC ?? 0).toFixed(1)}</td>
                        <td className={cn('px-4 py-2 text-right font-bold', Number(q.AVG_SEC ?? 0) > 30 ? 'text-red-400' : Number(q.AVG_SEC ?? 0) > 5 ? 'text-yellow-400' : 'text-slate-300')}>
                          {Number(q.AVG_SEC ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-400">{Number(q.MAX_SEC ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-slate-300">{Number(q.EXECUTION_COUNT ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2 text-slate-400">{String(q.USER_NAME ?? '—')}</td>
                        <td className="px-4 py-2 text-slate-500">{String(q.SCHEMA_NAME ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
