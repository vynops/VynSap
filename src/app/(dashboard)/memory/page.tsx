'use client'

import useSWR from 'swr'
import { MemoryStick } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const fetcher = (url: string) => fetch(url).then(r => r.json())

function MemBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400 font-medium">{label}</span>
        <span className="text-slate-300 font-bold">{value.toFixed(2)} GB</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-slate-600 mt-0.5">{pct.toFixed(1)}% of {max.toFixed(1)} GB</div>
    </div>
  )
}

export default function MemoryPage() {
  const { data, isLoading } = useSWR('/api/memory', fetcher, { refreshInterval: 15000 })
  const rows = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Memory Management</h2>
        <p className="text-sm text-slate-400 mt-0.5">ERP database memory allocation breakdown from M_HOST_RESOURCE_UTILIZATION</p>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">No data. Add an ERP system connection.</div>
      ) : rows.map((r: {
        connId: string; connName: string
        overview: { LIMIT_GB: number; USED_GB: number; FREE_GB: number; PHYS_USED_GB: number }
        heap: { HEAP_USED_GB: number; HEAP_ALLOC_GB: number }
        shared: { SHARED_GB: number }
        columnStore: { CS_TOTAL_GB: number; CS_MAIN_GB: number; CS_DELTA_GB: number; TABLE_COUNT: number }
      }) => {
        const ov = r.overview ?? {}
        const limit = Number(ov.LIMIT_GB ?? 0)
        const csTotal = Number(r.columnStore?.CS_TOTAL_GB ?? 0)
        const heap = Number(r.heap?.HEAP_USED_GB ?? 0)
        const shared = Number(r.shared?.SHARED_GB ?? 0)
        const other = Math.max(0, Number(ov.USED_GB ?? 0) - csTotal - heap - shared)

        const pieData = [
          { name: 'Column Store', value: csTotal, color: '#3b82f6' },
          { name: 'Heap', value: heap, color: '#8b5cf6' },
          { name: 'Shared', value: shared, color: '#06b6d4' },
          { name: 'Other', value: other, color: '#64748b' },
        ].filter(d => d.value > 0)

        return (
          <div key={r.connId} className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5 space-y-4">
                <div className="text-xs font-bold text-slate-400">Memory Overview</div>
                <MemBar label="ERP DB Allocation Limit" value={limit} max={limit} color="bg-slate-600" />
                <MemBar label="ERP DB Total Used" value={Number(ov.USED_GB ?? 0)} max={limit} color="bg-blue-500" />
                <MemBar label="Physical Memory Used" value={Number(ov.PHYS_USED_GB ?? 0)} max={limit} color="bg-cyan-500" />
                <MemBar label="Column Store (Main)" value={Number(r.columnStore?.CS_MAIN_GB ?? 0)} max={limit} color="bg-indigo-500" />
                <MemBar label="Column Store (Delta)" value={Number(r.columnStore?.CS_DELTA_GB ?? 0)} max={limit} color="bg-purple-500" />
                <MemBar label="Heap Memory" value={heap} max={limit} color="bg-violet-500" />
              </div>

              <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
                <div className="text-xs font-bold text-slate-400 mb-3">Memory Distribution</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} strokeWidth={0}>
                        {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0f1629', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }}
                        formatter={(v: number) => [`${v.toFixed(2)} GB`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-xs text-slate-400">{d.name}</span>
                      <span className="text-xs text-slate-300 ml-auto font-bold">{d.value.toFixed(1)}G</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-white">{Number(r.columnStore?.TABLE_COUNT ?? 0).toLocaleString()}</div>
                <div className="text-xs text-slate-500">CS Tables Loaded</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-blue-400">{csTotal.toFixed(2)} GB</div>
                <div className="text-xs text-slate-500">Column Store Total</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-emerald-400">{Number(ov.FREE_GB ?? 0).toFixed(2)} GB</div>
                <div className="text-xs text-slate-500">Physical Free</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-purple-400">{Number(r.heap?.HEAP_ALLOC_GB ?? 0).toFixed(2)} GB</div>
                <div className="text-xs text-slate-500">Heap Allocated</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
