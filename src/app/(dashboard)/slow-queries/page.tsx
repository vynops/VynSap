'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Zap, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function SlowQueriesPage() {
  const [minSec, setMinSec] = useState(5)
  const { data, isLoading } = useSWR(() => `/api/slow-queries?minSec=${minSec}`, fetcher, { refreshInterval: 30000 })
  const [filter, setFilter] = useState('')

  const rows = Array.isArray(data) ? data : []
  const filtered = rows.filter((r: { SQL_TEXT: string; USER_NAME: string }) =>
    !filter || String(r.SQL_TEXT ?? '').toLowerCase().includes(filter.toLowerCase()) ||
    String(r.USER_NAME ?? '').toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Slow Queries</h2>
          <p className="text-sm text-slate-400 mt-0.5">SQL statements with avg execution time above threshold</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-400">Min avg:</label>
          {[1, 5, 30, 60, 300].map(s => (
            <button key={s} onClick={() => setMinSec(s)}
              className={cn('text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors',
                minSec === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              )}>
              {s >= 60 ? `${s/60}m` : `${s}s`}
            </button>
          ))}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter…"
              className="bg-slate-800/60 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 w-36" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-8 text-center">
          <Zap className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No slow queries above {minSec}s threshold. 🎉</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-400">Slow Queries</span>
            <span className="ml-2 text-[10px] text-slate-600">{filtered.length} found</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-2 text-slate-500 font-bold">SQL</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-bold">Avg (s)</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-bold">Max (s)</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-bold">Total (s)</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-bold">Execs</th>
                  <th className="text-right px-4 py-2 text-slate-500 font-bold">Lock Waits</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-bold">User</th>
                  <th className="text-left px-4 py-2 text-slate-500 font-bold">System</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.map((q: Record<string, unknown>, i: number) => (
                  <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-mono text-[10px] text-slate-300 truncate" title={String(q.SQL_TEXT ?? '')}>
                        {String(q.SQL_TEXT ?? '').slice(0, 100)}
                      </div>
                      <div className="text-[9px] text-slate-600 mt-0.5">{String(q.OPERATION ?? '')} · {String(q.SCHEMA_NAME ?? '')}</div>
                    </td>
                    <td className={cn('px-4 py-3 text-right font-black',
                      Number(q.AVG_SEC ?? 0) > 60 ? 'text-red-400' : Number(q.AVG_SEC ?? 0) > 10 ? 'text-orange-400' : 'text-yellow-400'
                    )}>
                      {Number(q.AVG_SEC ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{Number(q.MAX_SEC ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{Number(q.TOTAL_SEC ?? 0).toFixed(1)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{Number(q.EXECUTION_COUNT ?? 0).toLocaleString()}</td>
                    <td className={cn('px-4 py-3 text-right', Number(q.TOTAL_LOCK_WAIT_COUNT ?? 0) > 0 ? 'text-red-400 font-bold' : 'text-slate-500')}>
                      {String(q.TOTAL_LOCK_WAIT_COUNT ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{String(q.USER_NAME ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500">{String(q.connName ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
