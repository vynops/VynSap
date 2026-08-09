'use client'

import useSWR from 'swr'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function CapacityPage() {
  const { data, isLoading } = useSWR('/api/capacity', fetcher, { refreshInterval: 60000 })
  const rows = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Capacity Planning</h2>
        <p className="text-sm text-slate-400 mt-0.5">Disk usage, data volumes, and log volumes from M_DISK_USAGE & M_VOLUMES</p>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">No connections.</div>
      ) : rows.map((r: {
        connId: string; connName: string
        disk: Record<string, unknown>[]
        volumes: Record<string, unknown>[]
        dataArea: Record<string, unknown>[]
        kpis?: { peakUsedPct?: number; dailyGrowthPct?: number; daysToExhaustion?: number | null; projectedExhaustionAt?: string | null }
      }) => {
        const disk = r.disk ?? []
        const volumes = r.volumes ?? []
        const chartData = disk.map(d => ({
          name: `${String(d.USAGE_TYPE).slice(0, 10)} ${String(d.HOST).split('.')[0]}`,
          total: Number(d.TOTAL_GB ?? 0),
          used: Number(d.USED_GB ?? 0),
          pct: Number(d.USED_PCT ?? 0),
        }))

        return (
          <div key={r.connId} className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className={cn('text-xl font-black', Number(r.kpis?.peakUsedPct ?? 0) >= 90 ? 'text-red-400' : Number(r.kpis?.peakUsedPct ?? 0) >= 75 ? 'text-yellow-400' : 'text-emerald-400')}>
                  {Number(r.kpis?.peakUsedPct ?? 0).toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500">Peak Usage</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-blue-400">{Number(r.kpis?.dailyGrowthPct ?? 0).toFixed(2)}%</div>
                <div className="text-xs text-slate-500">Daily Growth</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-purple-400">{r.kpis?.daysToExhaustion == null ? 'N/A' : Number(r.kpis.daysToExhaustion).toFixed(1)}</div>
                <div className="text-xs text-slate-500">Days to Exhaustion</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-[11px] font-black text-slate-300">{r.kpis?.projectedExhaustionAt ? String(r.kpis.projectedExhaustionAt).slice(0, 10) : 'N/A'}</div>
                <div className="text-xs text-slate-500">Projected Exhaustion</div>
              </div>
            </div>

            {/* Disk usage chart */}
            {chartData.length > 0 && (
              <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
                <div className="text-xs font-bold text-slate-400 mb-4">Disk Usage by Area (GB)</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barSize={20}>
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="used" name="Used GB">
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.pct >= 90 ? '#ef4444' : d.pct >= 75 ? '#f59e0b' : '#3b82f6'} />
                        ))}
                      </Bar>
                      <Bar dataKey="total" name="Total GB" fill="#1e293b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Disk table */}
            <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400">Disk Areas (M_DISK_USAGE)</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Usage Type</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Path</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-bold">Total GB</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-bold">Used GB</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-bold">Free GB</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Used %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {disk.map((d, i) => {
                    const pct = Number(d.USED_PCT ?? 0)
                    return (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 font-medium text-slate-300">{String(d.USAGE_TYPE)}</td>
                        <td className="px-4 py-2 text-slate-500 font-mono text-[10px] max-w-xs truncate">{String(d.PATH ?? '—')}</td>
                        <td className="px-4 py-2 text-right text-white font-bold">{Number(d.TOTAL_GB ?? 0).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right text-blue-400">{Number(d.USED_GB ?? 0).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right text-emerald-400">{Number(d.FREE_GB ?? 0).toFixed(1)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-blue-500')}
                                style={{ width: `${pct}%` }} />
                            </div>
                            <span className={cn('text-[10px] font-bold w-8',
                              pct >= 90 ? 'text-red-400' : pct >= 75 ? 'text-yellow-400' : 'text-slate-400'
                            )}>{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
