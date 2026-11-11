'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Bell, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const RATING_COLOR = (r: number) =>
  r >= 5 ? 'bg-red-500/20 text-red-400' :
  r >= 3 ? 'bg-yellow-500/20 text-yellow-400' :
  'bg-blue-500/20 text-blue-400'

const RATING_LABEL = (r: number) =>
  r >= 5 ? 'Critical' : r >= 3 ? 'Warning' : 'Info'

export default function AlertsPage() {
  const { data, isLoading } = useSWR('/api/alerts', fetcher, { refreshInterval: 15000 })
  const [alertFilter, setAlertFilter] = useState<{ connectionId: string | null; severity: 'all' | 'critical' | 'warning' }>({ connectionId: null, severity: 'all' })
  const rows = Array.isArray(data) ? data : []
  const visibleRows = alertFilter.connectionId ? rows.filter((row: { connId: string }) => row.connId === alertFilter.connectionId) : rows

  function selectAlertFilter(connectionId: string, severity: typeof alertFilter.severity) {
    setAlertFilter(current => current.connectionId === connectionId && current.severity === severity
      ? { connectionId: null, severity: 'all' }
      : { connectionId, severity })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Alert Center</h2>
        <p className="text-sm text-slate-400 mt-0.5">ERP database alerts from M_ALERTS and M_ALERT_DEFINITIONS</p>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading alerts…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">No ERP system connections.</div>
      ) : visibleRows.map((r: {
        connId: string; connName: string
        active: Record<string, unknown>[]
        definitions: Record<string, unknown>[]
        summary?: { rawEvents24h?: number; actionableAlerts24h?: number; noiseRatioPct?: number; correlationCompression?: number }
      }) => {
        const active = r.active ?? []
        const displayedAlerts = active.filter(a => alertFilter.connectionId !== r.connId || alertFilter.severity === 'all' || (alertFilter.severity === 'critical'
          ? Number(a.ALERT_RATING ?? 0) >= 5
          : Number(a.ALERT_RATING ?? 0) >= 3 && Number(a.ALERT_RATING ?? 0) < 5))
        const critical = active.filter(a => Number(a.ALERT_RATING ?? 0) >= 5).length
        const warning = active.filter(a => Number(a.ALERT_RATING ?? 0) >= 3 && Number(a.ALERT_RATING ?? 0) < 5).length
        const rawEvents24h = Number(r.summary?.rawEvents24h ?? active.length)
        const noiseRatioPct = Number(r.summary?.noiseRatioPct ?? 0)
        const compression = Number(r.summary?.correlationCompression ?? 1)

        return (
          <div key={r.connId} id={`active-alerts-${r.connId}`} className="space-y-4 scroll-mt-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <button type="button" onClick={() => selectAlertFilter(r.connId, 'all')} aria-pressed={alertFilter.connectionId === r.connId && alertFilter.severity === 'all'} aria-label={`Show all alerts for ${r.connName}`} className={`w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${alertFilter.connectionId === r.connId && alertFilter.severity === 'all' ? 'ring-1 ring-blue-500/70' : ''}`}><div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center transition-colors hover:border-blue-500/50">
                <div className="text-xl font-black text-white">{active.length}</div>
                <div className="text-xs text-slate-500">Total Alerts</div>
              </div></button>
              <button type="button" onClick={() => selectAlertFilter(r.connId, 'critical')} aria-pressed={alertFilter.connectionId === r.connId && alertFilter.severity === 'critical'} aria-label={`Filter to critical alerts for ${r.connName}`} className={`w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${alertFilter.connectionId === r.connId && alertFilter.severity === 'critical' ? 'ring-1 ring-red-500/70' : ''}`}><div className="rounded-xl bg-[#0f1629] border border-red-900/30 p-4 text-center transition-colors hover:border-red-500/50">
                <div className={cn('text-xl font-black', critical > 0 ? 'text-red-400' : 'text-slate-400')}>{critical}</div>
                <div className="text-xs text-slate-500">Critical</div>
              </div></button>
              <button type="button" onClick={() => selectAlertFilter(r.connId, 'warning')} aria-pressed={alertFilter.connectionId === r.connId && alertFilter.severity === 'warning'} aria-label={`Filter to warning alerts for ${r.connName}`} className={`w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${alertFilter.connectionId === r.connId && alertFilter.severity === 'warning' ? 'ring-1 ring-yellow-500/70' : ''}`}><div className="rounded-xl bg-[#0f1629] border border-yellow-900/30 p-4 text-center transition-colors hover:border-yellow-500/50">
                <div className={cn('text-xl font-black', warning > 0 ? 'text-yellow-400' : 'text-slate-400')}>{warning}</div>
                <div className="text-xs text-slate-500">Warning</div>
              </div></button>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-blue-400">{rawEvents24h}</div>
                <div className="text-xs text-slate-500">Raw Events (24h)</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className={cn('text-xl font-black', noiseRatioPct >= 70 ? 'text-red-400' : noiseRatioPct >= 45 ? 'text-yellow-400' : 'text-emerald-400')}>{noiseRatioPct.toFixed(1)}%</div>
                <div className="text-xs text-slate-500">Noise Ratio</div>
                <div className="text-[10px] text-slate-600 mt-1">Compression {compression.toFixed(2)}x</div>
              </div>
            </div>

            {alertFilter.connectionId === r.connId && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Showing {alertFilter.severity === 'all' ? 'all' : alertFilter.severity} alerts for {r.connName} ({displayedAlerts.length})</span>
                <button type="button" onClick={() => setAlertFilter({ connectionId: null, severity: 'all' })} className="text-blue-400 hover:underline">Clear filter</button>
              </div>
            )}

            {displayedAlerts.length === 0 ? (
              <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-6 text-center">
                <Bell className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-emerald-400 text-sm font-semibold">{active.length === 0 ? 'All Clear — No active alerts' : 'No alerts match this filter'}</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-400">Active Alerts (M_ALERTS)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-center px-4 py-2 text-slate-500 font-bold">ID</th>
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Severity</th>
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Details</th>
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Action</th>
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Service</th>
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {displayedAlerts.map((a, i) => (
                        <tr key={i} className="hover:bg-slate-800/20">
                          <td className="px-4 py-2 text-center">
                            <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5', RATING_COLOR(Number(a.ALERT_RATING ?? 0)))}>
                              {RATING_LABEL(Number(a.ALERT_RATING ?? 0))}
                            </span>
                          </td>
                          <td className={cn('px-4 py-2 font-bold text-sm', RATING_COLOR(Number(a.ALERT_RATING ?? 0)).split(' ')[1])}>
                            {String(a.ALERT_RATING ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-slate-300 max-w-xs">
                            <div className="truncate">{String(a.ALERT_DETAILS ?? '—')}</div>
                          </td>
                          <td className="px-4 py-2 text-slate-400 max-w-xs">
                            <div className="truncate">{String(a.ALERT_USERACTION ?? '—')}</div>
                          </td>
                          <td className="px-4 py-2 text-slate-500">{String(a.SERVICE_NAME ?? '—')}</td>
                          <td className="px-4 py-2 text-slate-600">{String(a.ALERT_TIMESTAMP ?? '—').slice(0, 16)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
