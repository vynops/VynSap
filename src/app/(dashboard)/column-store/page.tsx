'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Columns3, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type SortKey = 'TOTAL_MB' | 'DELTA_MB' | 'ROW_COUNT' | 'TABLE_NAME'

export default function ColumnStorePage() {
  const { data, isLoading } = useSWR('/api/column-store', fetcher, { refreshInterval: 30000 })
  const [sortBy, setSortBy] = useState<SortKey>('TOTAL_MB')
  const [tab, setTab] = useState<'tables' | 'unloads' | 'delta'>('tables')
  const rows = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Column Store Analysis</h2>
        <p className="text-sm text-slate-400 mt-0.5">SAP ERP column store memory, delta merges, and unloads</p>
      </div>

      {/* Summary cards */}
      {rows.map((r: {
        connId: string; connName: string
        summary: { TOTAL_GB: number; MAIN_GB: number; DELTA_GB: number; TABLE_COUNT: number; TOTAL_ROWS: number; FULLY_LOADED: number; UNLOADED_COUNT: number }
        tables: Record<string, unknown>[]
        unloaded: Record<string, unknown>[]
        topDelta: Record<string, unknown>[]
      }) => {
        const s = r.summary ?? {}
        const tables = r.tables ?? []
        const sorted = [...tables].sort((a, b) => Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0))

        return (
          <div key={r.connId} className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'CS Total Memory', value: `${Number(s.TOTAL_GB ?? 0).toFixed(2)} GB`, color: 'text-blue-400' },
                { label: 'Main Store', value: `${Number(s.MAIN_GB ?? 0).toFixed(2)} GB`, color: 'text-cyan-400' },
                { label: 'Delta Store', value: `${Number(s.DELTA_GB ?? 0).toFixed(2)} GB`, color: 'text-yellow-400' },
                { label: 'Tables Loaded', value: `${Number(s.FULLY_LOADED ?? 0)} / ${Number(s.TABLE_COUNT ?? 0)}`, color: 'text-emerald-400' },
              ].map(stat => (
                <div key={stat.label} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
                  <div className={cn('text-xl font-black', stat.color)}>{stat.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1 w-fit">
              {(['tables', 'unloads', 'delta'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={cn('px-3 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize',
                    tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  )}>
                  {t === 'tables' ? 'Tables' : t === 'unloads' ? 'Unloads' : 'Delta Merges'}
                </button>
              ))}
            </div>

            {tab === 'tables' && (
              <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Column Store Tables</span>
                  <div className="ml-auto flex gap-1">
                    {(['TOTAL_MB', 'DELTA_MB', 'ROW_COUNT'] as SortKey[]).map(k => (
                      <button key={k} onClick={() => setSortBy(k)}
                        className={cn('text-[10px] px-2 py-1 rounded font-semibold transition-colors',
                          sortBy === k ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'
                        )}>
                        {k === 'TOTAL_MB' ? 'By Memory' : k === 'DELTA_MB' ? 'By Delta' : 'By Rows'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema.Table</th>
                        <th className="text-right px-4 py-2 text-slate-500 font-bold">Total MB</th>
                        <th className="text-right px-4 py-2 text-slate-500 font-bold">Main MB</th>
                        <th className="text-right px-4 py-2 text-slate-500 font-bold">Delta MB</th>
                        <th className="text-right px-4 py-2 text-slate-500 font-bold">Rows</th>
                        <th className="text-right px-4 py-2 text-slate-500 font-bold">Delta Rows</th>
                        <th className="text-center px-4 py-2 text-slate-500 font-bold">Loaded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {sorted.slice(0, 100).map((t, i) => (
                        <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                          <td className="px-4 py-2 font-medium text-slate-300">
                            {String(t.SCHEMA_NAME)}.{String(t.TABLE_NAME)}
                          </td>
                          <td className="px-4 py-2 text-right text-white font-bold">{Number(t.TOTAL_MB ?? 0).toFixed(1)}</td>
                          <td className="px-4 py-2 text-right text-slate-400">{Number(t.MAIN_MB ?? 0).toFixed(1)}</td>
                          <td className={cn('px-4 py-2 text-right font-bold', Number(t.DELTA_MB ?? 0) > 100 ? 'text-yellow-400' : 'text-slate-400')}>
                            {Number(t.DELTA_MB ?? 0).toFixed(1)}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">{Number(t.ROW_COUNT ?? 0).toLocaleString()}</td>
                          <td className={cn('px-4 py-2 text-right', Number(t.DELTA_ROWS ?? 0) > 10000 ? 'text-yellow-400 font-bold' : 'text-slate-400')}>
                            {Number(t.DELTA_ROWS ?? 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5',
                              String(t.LOADED) === 'FULL' ? 'bg-emerald-500/20 text-emerald-400' :
                              String(t.LOADED) === 'NO' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            )}>{String(t.LOADED ?? '?')}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'unloads' && (
              <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-400">Frequently Unloaded Tables (M_CS_UNLOADS)</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema.Table</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Unload Count</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Last Unload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {(r.unloaded ?? []).map((u, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 text-slate-300 font-medium">{String(u.SCHEMA_NAME)}.{String(u.TABLE_NAME)}</td>
                        <td className="px-4 py-2 text-right font-bold text-orange-400">{String(u.UNLOAD_COUNT)}</td>
                        <td className="px-4 py-2 text-slate-500">{String(u.LAST_UNLOAD ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'delta' && (
              <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-400">Top Delta Store Candidates (M_CS_TABLES)</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema.Table</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Delta Rows</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Merge Count</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Last Merge</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {(r.topDelta ?? []).map((d, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 text-slate-300 font-medium">{String(d.SCHEMA_NAME)}.{String(d.TABLE_NAME)}</td>
                        <td className={cn('px-4 py-2 text-right font-bold', Number(d.DELTA_ROWS ?? 0) > 100000 ? 'text-red-400' : Number(d.DELTA_ROWS ?? 0) > 10000 ? 'text-yellow-400' : 'text-slate-300')}>
                          {Number(d.DELTA_ROWS ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-400">{String(d.MERGE_COUNT ?? 0)}</td>
                        <td className="px-4 py-2 text-slate-500">{String(d.LAST_MERGE_TIME ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
