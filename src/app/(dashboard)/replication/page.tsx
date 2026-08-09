'use client'

import useSWR from 'swr'
import { GitBranch, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function ReplicationPage() {
  const { data, isLoading } = useSWR('/api/replication', fetcher, { refreshInterval: 10000 })
  const rows = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">ERP Database Replication (HSR)</h2>
        <p className="text-sm text-slate-400 mt-0.5">Real-time replication status from M_SERVICE_REPLICATION & M_SYSTEM_REPLICATION_SITES</p>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">No ERP system connections configured.</div>
      ) : rows.map((r: {
        connId: string; connName: string
        status: Record<string, unknown>[]
        sites: Record<string, unknown>[]
        log: Record<string, unknown>[]
        kpis?: { rpoTargetSec?: number; avgLagSec?: number; maxLagSec?: number; rpoCompliancePct?: number }
      }) => (
        <div key={r.connId} className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
              <div className="text-xl font-black text-blue-400">{Number(r.kpis?.rpoTargetSec ?? 60).toFixed(0)}s</div>
              <div className="text-xs text-slate-500">RPO Target</div>
            </div>
            <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
              <div className="text-xl font-black text-yellow-400">{Number(r.kpis?.avgLagSec ?? 0).toFixed(2)}s</div>
              <div className="text-xs text-slate-500">Avg Lag</div>
            </div>
            <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
              <div className={cn('text-xl font-black', Number(r.kpis?.maxLagSec ?? 0) > Number(r.kpis?.rpoTargetSec ?? 60) ? 'text-red-400' : 'text-emerald-400')}>
                {Number(r.kpis?.maxLagSec ?? 0).toFixed(2)}s
              </div>
              <div className="text-xs text-slate-500">Max Lag</div>
            </div>
            <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
              <div className={cn('text-xl font-black', Number(r.kpis?.rpoCompliancePct ?? 100) < 95 ? 'text-red-400' : Number(r.kpis?.rpoCompliancePct ?? 100) < 99 ? 'text-yellow-400' : 'text-emerald-400')}>
                {Number(r.kpis?.rpoCompliancePct ?? 100).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">RPO Compliance</div>
            </div>
          </div>

          {/* Sites overview */}
          {r.sites && r.sites.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {r.sites.map((site, i) => (
                <div key={i} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="w-4 h-4 text-blue-400" />
                    <span className="font-bold text-white text-sm">Site {String(site.SITE_ID)}: {String(site.SITE_NAME ?? '—')}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Replication Mode</span>
                      <span className="text-blue-400 font-bold">{String(site.REPLICATION_MODE ?? '—')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Operation Mode</span>
                      <span className="text-slate-300">{String(site.OPERATION_MODE ?? '—')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Failover Status</span>
                      <span className={cn('font-bold',
                        String(site.FAILOVER_STATUS) === 'OK' ? 'text-emerald-400' : 'text-yellow-400'
                      )}>{String(site.FAILOVER_STATUS ?? '—')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Service replication status */}
          {r.status && r.status.length > 0 ? (
            <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400">Service Replication Status</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Host</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Status</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Mode</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-bold">Lag (ms)</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-bold">Shipped MB</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-bold">Replicated MB</th>
                    <th className="text-center px-4 py-2 text-slate-500 font-bold">Fully Synced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {r.status.map((s, i) => {
                    const lag = Number(s.REPLICATION_DELAY_MS ?? 0)
                    return (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 text-slate-300">{String(s.HOST ?? '—')}</td>
                        <td className="px-4 py-2">
                          <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5',
                            String(s.REPLICATION_STATUS) === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' :
                            String(s.REPLICATION_STATUS) === 'SYNCING' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          )}>{String(s.REPLICATION_STATUS ?? '—')}</span>
                        </td>
                        <td className="px-4 py-2 text-slate-400">{String(s.REPLICATION_MODE ?? '—')}</td>
                        <td className={cn('px-4 py-2 text-right font-bold',
                          lag > 5000 ? 'text-red-400' : lag > 1000 ? 'text-yellow-400' : 'text-emerald-400'
                        )}>{lag.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-slate-300">{Number(s.SHIPPED_LOG_MB ?? 0).toFixed(0)}</td>
                        <td className="px-4 py-2 text-right text-slate-300">{Number(s.REPLICATED_LOG_MB ?? 0).toFixed(0)}</td>
                        <td className="px-4 py-2 text-center">
                          {String(s.SECONDARY_FULLY_SYNCED) === 'TRUE'
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                            : <AlertTriangle className="w-4 h-4 text-yellow-400 mx-auto" />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-6 text-center text-slate-500 text-sm">
              <GitBranch className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              No HSR configured on this system (or insufficient privileges).
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
