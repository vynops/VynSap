'use client'

import useSWR from 'swr'
import { AlertTriangle, CheckCircle2, Clock3, Gauge, Layers3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface ModuleDashboardProps {
  code: 'FI' | 'MM' | 'SD' | 'PP' | 'HCM'
  title: string
  description: string
}

export function ModuleDashboard({ code, title, description }: ModuleDashboardProps) {
  const { data, isLoading } = useSWR(`/api/modules?code=${code}`, fetcher, { refreshInterval: 20000 })
  const module = data?.modules?.[0]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="text-sm text-slate-400 mt-0.5">{description}</p>
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm py-8 text-center">Loading module telemetry...</div>
      ) : !module ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-8 text-center text-slate-500 text-sm">
          No module telemetry available.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4">
              <div className="text-[11px] text-slate-500 mb-1">Availability</div>
              <div className="text-xl font-black text-emerald-400">{module.availabilityPct}%</div>
            </div>
            <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4">
              <div className="text-[11px] text-slate-500 mb-1">Failed Transactions</div>
              <div className="text-xl font-black text-red-400">{module.failedTransactions}</div>
            </div>
            <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4">
              <div className="text-[11px] text-slate-500 mb-1">Queue Backlog</div>
              <div className="text-xl font-black text-yellow-400">{module.queueBacklog}</div>
            </div>
            <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4">
              <div className="text-[11px] text-slate-500 mb-1">Integration Lag</div>
              <div className="text-xl font-black text-blue-400">{module.integrationLagMins}m</div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Core Workflows</div>
            <div className="grid gap-2">
              {(module.workflows ?? []).map((w: string) => (
                <div key={w} className="flex items-center gap-2 text-sm text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  {w}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Current Risk</span>
            </div>
            <p className="text-sm text-slate-300">{module.topIssue}</p>
          </div>

          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Open Module Events</span>
              <span className="text-[10px] text-slate-600">{module.openEvents?.length ?? 0} active</span>
            </div>
            {(module.openEvents?.length ?? 0) === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500 text-center">No active events.</div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {module.openEvents.map((e: { id: string; severity: string; title: string; ageMins: number }) => (
                  <div key={e.id} className="px-4 py-3 text-xs flex items-center gap-3">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 font-bold text-[10px]',
                      e.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                      e.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      e.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-300'
                    )}>
                      {e.severity}
                    </span>
                    <span className="text-slate-300 flex-1">{e.title}</span>
                    <span className="text-slate-500">{e.ageMins}m ago</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
