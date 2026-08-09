'use client'

import useSWR from 'swr'
import { Timer, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function SLAPage() {
  const { data, isLoading } = useSWR('/api/sla', fetcher, { refreshInterval: 60000 })
  const target = data?.target ?? 99.9
  const entries = data?.entries ?? []
  const summary = data?.summary ?? { systems: entries.length, breaches: 0, globalUptime: 100, avgMttrMin: 0 }

  const breached = entries.filter((e: { breached: boolean }) => e.breached).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">SLA Tracker</h2>
          <p className="text-sm text-slate-400 mt-0.5">30-day uptime based on incident duration · Target: {target}%</p>
        </div>
        <div className={cn('text-2xl font-black', breached > 0 ? 'text-red-400' : 'text-emerald-400')}>
          {breached > 0 ? `${breached} breach${breached > 1 ? 'es' : ''}` : 'All green'}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-white">{summary.systems}</div>
          <div className="text-xs text-slate-500">Tracked Systems</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className={cn('text-xl font-black', summary.breaches > 0 ? 'text-red-400' : 'text-emerald-400')}>{summary.breaches}</div>
          <div className="text-xs text-slate-500">Breaches</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-blue-400">{Number(summary.globalUptime ?? 0).toFixed(3)}%</div>
          <div className="text-xs text-slate-500">Global Uptime</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-yellow-400">{summary.avgMttrMin}m</div>
          <div className="text-xs text-slate-500">Avg MTTR</div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading SLA data…</div>
      ) : entries.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">No ERP system connections configured.</div>
      ) : (
        <div className="space-y-3">
          {entries.map((e: {
            connId: string; connName: string; environment: string
            uptimePct: number; targetPct: number; breached: boolean
            incidentCount: number; downtimeMin: number; openIncidents: number
            mttrMin: number; errorBudgetRemainingMin: number; allowedDowntimeMin: number
          }) => {
            const pct = e.uptimePct
            const barColor = pct >= e.targetPct ? 'bg-emerald-500' : pct >= 99 ? 'bg-yellow-500' : 'bg-red-500'
            return (
              <div key={e.connId} className={cn(
                'rounded-2xl bg-[#0f1629] border p-5',
                e.breached ? 'border-red-500/30' : 'border-slate-800'
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      {e.connName}
                      {e.breached
                        ? <XCircle className="w-4 h-4 text-red-400" />
                        : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 capitalize">{e.environment}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn('text-2xl font-black', e.breached ? 'text-red-400' : 'text-emerald-400')}>
                      {pct.toFixed(3)}%
                    </div>
                    <div className="text-xs text-slate-500">vs {e.targetPct}% target</div>
                  </div>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-3">
                  <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-sm font-bold text-white">{e.incidentCount}</div>
                    <div className="text-[10px] text-slate-500">Incidents (30d)</div>
                  </div>
                  <div>
                    <div className={cn('text-sm font-bold', e.downtimeMin > 0 ? 'text-red-400' : 'text-slate-400')}>
                      {e.downtimeMin}m
                    </div>
                    <div className="text-[10px] text-slate-500">Downtime</div>
                  </div>
                  <div>
                    <div className={cn('text-sm font-bold', e.openIncidents > 0 ? 'text-orange-400' : 'text-emerald-400')}>
                      {e.openIncidents}
                    </div>
                    <div className="text-[10px] text-slate-500">Open Now</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center mt-3">
                  <div className="rounded-lg bg-slate-800/40 py-2">
                    <div className="text-xs font-bold text-yellow-400">{e.mttrMin}m</div>
                    <div className="text-[10px] text-slate-500">MTTR</div>
                  </div>
                  <div className="rounded-lg bg-slate-800/40 py-2">
                    <div className={cn('text-xs font-bold', e.errorBudgetRemainingMin > 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {e.errorBudgetRemainingMin}m / {e.allowedDowntimeMin}m
                    </div>
                    <div className="text-[10px] text-slate-500">Error Budget Left</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
