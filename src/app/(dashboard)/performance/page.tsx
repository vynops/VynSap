'use client'

import useSWR from 'swr'
import { Activity, Cpu, MemoryStick, HardDrive, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

const fetcher = (url: string) => fetch(url).then(r => r.json())

function MetricCard({ label, value, unit, max, color = 'blue', icon: Icon }: {
  label: string; value: number; unit?: string; max?: number; color?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : null
  const barColor = pct === null ? 'bg-blue-500' : pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-blue-500'
  return (
    <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 text-${color}-400`} />
        <span className="text-xs font-bold text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-black text-white">
        {value.toFixed(value < 10 ? 1 : 0)}<span className="text-sm text-slate-500 font-normal ml-1">{unit}</span>
      </div>
      {pct !== null && (
        <div className="mt-3">
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-500 mt-1">{pct}% used</div>
        </div>
      )}
    </div>
  )
}

export default function PerformancePage() {
  const { data, isLoading } = useSWR('/api/performance', fetcher, { refreshInterval: 10000 })
  const rows = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Performance Dashboard</h2>
        <p className="text-sm text-slate-400 mt-0.5">Live metrics from ERP database monitoring views · refreshes every 10s</p>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading metrics…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">No ERP system connections. Add one in Tenant DBs.</div>
      ) : rows.map((r: {
        connId: string; connName: string
        cpu: { CPU_USED_PCT: number }
        memory: { MEM_USED_GB: number; MEM_LIMIT_GB: number; ERP_USED_GB: number; MEM_FREE_GB: number }
        io: { READ_MB: number; WRITE_MB: number; READ_OPS: number; WRITE_OPS: number }
        connections: { TOTAL_CONN: number; RUNNING: number; IDLE: number }
      }) => (
        <div key={r.connId}>
          <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wide">{r.connName}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <MetricCard
              label="CPU Usage" icon={Cpu} color="orange"
              value={Number(r.cpu?.CPU_USED_PCT ?? 0)} unit="%"
              max={100}
            />
            <MetricCard
                label="ERP DB Memory" icon={MemoryStick} color="blue"
              value={Number(r.memory?.ERP_USED_GB ?? 0)} unit="GB"
              max={Number(r.memory?.MEM_LIMIT_GB ?? 1)}
            />
            <MetricCard
              label="Physical Memory" icon={MemoryStick} color="cyan"
              value={Number(r.memory?.MEM_USED_GB ?? 0)} unit="GB"
              max={Number(r.memory?.MEM_LIMIT_GB ?? 1)}
            />
            <MetricCard
              label="Connections" icon={Wifi} color="purple"
              value={Number(r.connections?.TOTAL_CONN ?? 0)} unit="total"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
              <div className="text-xs font-bold text-slate-400 mb-3">I/O Statistics (Cumulative)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-lg font-bold text-white">{Number(r.io?.READ_MB ?? 0).toFixed(0)} MB</div>
                  <div className="text-xs text-slate-500">Total Reads</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-white">{Number(r.io?.WRITE_MB ?? 0).toFixed(0)} MB</div>
                  <div className="text-xs text-slate-500">Total Writes</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-white">{Number(r.io?.READ_OPS ?? 0).toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Read Ops</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-white">{Number(r.io?.WRITE_OPS ?? 0).toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Write Ops</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
              <div className="text-xs font-bold text-slate-400 mb-3">Connection Breakdown</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold text-white">{Number(r.connections?.TOTAL_CONN ?? 0)}</div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-400">{Number(r.connections?.RUNNING ?? 0)}</div>
                  <div className="text-xs text-slate-500">Running</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-400">{Number(r.connections?.IDLE ?? 0)}</div>
                  <div className="text-xs text-slate-500">Idle</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
