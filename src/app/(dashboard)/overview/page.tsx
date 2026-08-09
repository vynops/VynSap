'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { AlertTriangle, BarChart3, CheckCircle2, Network, RefreshCw, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const fetcher = (url: string) => fetch(url).then(r => r.json())

function StatCard({ label, value, sub, color = 'text-white', icon: Icon, href }: {
  label: string; value: string | number; sub?: string; color?: string
  icon: React.ComponentType<{ className?: string }>; href?: string
}) {
  const inner = (
    <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5 hover:border-slate-700 transition-colors">
      <Icon className={cn('w-5 h-5 mb-3', color)} />
      <div className={cn('text-2xl font-black', color)}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

export default function OverviewPage() {
  const { data, isLoading, mutate } = useSWR('/api/erp-overview', fetcher, { refreshInterval: 30000 })
  const { data: processData } = useSWR('/api/processes', fetcher, { refreshInterval: 30000 })
  const { data: connectionsData } = useSWR('/api/connections', fetcher, { refreshInterval: 30000 })

  const connectors = Array.isArray(data?.connectors) ? data.connectors : []
  const processes = Array.isArray(data?.processes) ? data.processes : []
  const modules = Array.isArray(data?.modules) ? data.modules : []
  const events = Array.isArray(data?.events) ? data.events : []
  const trends = processData?.trends ?? {}
  const processKeys = Object.keys(trends)
  const firstKey = processKeys[0]
  const sampleTrend = firstKey ? trends[firstKey]?.last24h ?? [] : []
  const slo = processData?.slo
  const connections = Array.isArray(connectionsData) ? connectionsData : []
  const freshnessValues = connections
    .map((c: { freshnessLagMins?: number | null }) => Number(c.freshnessLagMins))
    .filter(v => Number.isFinite(v))
  const avgFreshnessLag = freshnessValues.length === 0
    ? null
    : freshnessValues.reduce((n, x) => n + x, 0) / freshnessValues.length

  const connectedConnectors = connectors.filter((c: { status: string }) => c.status === 'connected').length
  const totalFailures = processes.reduce((n: number, p: { failed: number }) => n + Number(p.failed ?? 0), 0)
  const totalBacklog = processes.reduce((n: number, p: { backlog: number }) => n + Number(p.backlog ?? 0), 0)
  const avgSla = processes.length === 0
    ? 0
    : processes.reduce((n: number, p: { slaPct: number }) => n + Number(p.slaPct ?? 0), 0) / processes.length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Connector Health" value={`${connectedConnectors}/${connectors.length}`} sub="OData / RFC / BAPI" color="text-blue-400" icon={Network} href="/tenants" />
        <StatCard label="Process Failures" value={totalFailures} sub="Current processing window" color={totalFailures > 0 ? 'text-red-400' : 'text-emerald-400'} icon={AlertTriangle} href="/incidents" />
        <StatCard label="Queue Backlog" value={totalBacklog} sub="Cross-process pending workload" color={totalBacklog > 0 ? 'text-yellow-400' : 'text-emerald-400'} icon={BarChart3} href="/automation" />
        <StatCard label="Average SLA" value={`${avgSla.toFixed(2)}%`} sub="Order-to-cash, procure-to-pay, record-to-report" color={avgSla >= 99 ? 'text-emerald-400' : 'text-orange-400'} icon={CheckCircle2} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
          <div className="text-[11px] text-slate-500">Connector Freshness Lag</div>
          <div className={cn('text-lg font-black mt-1', (avgFreshnessLag ?? 0) > 30 ? 'text-red-400' : (avgFreshnessLag ?? 0) > 5 ? 'text-yellow-400' : 'text-emerald-400')}>
            {avgFreshnessLag === null ? 'N/A' : `${avgFreshnessLag.toFixed(1)}m`}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">Average connector data age</div>
        </div>
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
          <div className="text-[11px] text-slate-500">SLO Burn Rate</div>
          <div className={cn('text-lg font-black mt-1', Number(slo?.burnRate1h ?? 1) > 1.5 ? 'text-red-400' : Number(slo?.burnRate1h ?? 1) > 1.1 ? 'text-yellow-400' : 'text-emerald-400')}>
            {Number(slo?.burnRate1h ?? 1).toFixed(2)}x / {Number(slo?.burnRate6h ?? 1).toFixed(2)}x
          </div>
          <div className="text-[10px] text-slate-600 mt-1">1h and 6h burn multipliers</div>
        </div>
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
          <div className="text-[11px] text-slate-500">Error Budget Exhaustion</div>
          <div className="text-lg font-black mt-1 text-blue-400">{Number(slo?.exhaustionForecastHours ?? 0).toFixed(1)}h</div>
          <div className="text-[10px] text-slate-600 mt-1">Projected time to budget exhaustion</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Process Execution</h2>
          <button onClick={() => mutate()} className="text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>

        {isLoading && processes.length === 0 ? (
          <div className="text-slate-600 text-sm py-8 text-center">Loading ERP process telemetry...</div>
        ) : processes.length === 0 ? (
          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-8 text-center text-slate-500 text-sm">
            Process telemetry will appear after the first collection cycle.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {processes.map((p: {
              key: string; label: string; throughput: number; failed: number; backlog: number; avgCycleMins: number; slaPct: number
            }) => (
              <div key={p.key} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-white text-sm">{p.label}</div>
                  <span className={cn(
                    'text-[10px] font-bold rounded-full px-2 py-0.5',
                    p.slaPct >= 99 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
                  )}>{p.slaPct.toFixed(2)}% SLA</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs font-bold text-white">{p.throughput}</div>
                    <div className="text-[10px] text-slate-600">Throughput</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-red-400">{p.failed}</div>
                    <div className="text-[10px] text-slate-600">Failed</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-yellow-400">{p.backlog}</div>
                    <div className="text-[10px] text-slate-600">Backlog</div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500">Average cycle time: {p.avgCycleMins} minutes</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div>
          <h2 className="text-base font-semibold text-white mb-3">Module Health</h2>
          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 divide-y divide-slate-800">
            {modules.map((m: { code: string; name: string; availabilityPct: number; queueBacklog: number; failedTransactions: number }) => (
              <div key={m.code} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className="font-semibold text-slate-300 w-14">{m.code}</span>
                <span className="text-slate-400 flex-1">{m.name}</span>
                <span className="text-emerald-400 text-xs">{m.availabilityPct}%</span>
                <span className="text-yellow-400 text-xs">Q:{m.queueBacklog}</span>
                <span className="text-red-400 text-xs">F:{m.failedTransactions}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-3">Open Business Events</h2>
          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 divide-y divide-slate-800">
            {events.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500 text-center">Open business events will appear here.</div>
            ) : (
              events.map((e: { id: string; module: string; severity: string; title: string; ageMins: number }) => (
                <div key={e.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-slate-700 text-slate-200">{e.module}</span>
                  <span className="text-slate-300 flex-1">{e.title}</span>
                  <span className={cn(
                    'text-[10px] font-bold rounded-full px-2 py-0.5',
                    e.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    e.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    e.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-300'
                  )}>{e.severity}</span>
                  <span className="text-slate-500 text-xs">{e.ageMins}m</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Process Trends (Last 24h)</h3>
            <span className="text-[10px] text-slate-500">Hourly</span>
          </div>
          {sampleTrend.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">Trend telemetry warming up...</div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sampleTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="ts" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v: string) => new Date(v).getHours().toString().padStart(2, '0')} />
                  <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#0b1220', border: '1px solid #1f2a44', borderRadius: 8 }}
                    labelFormatter={(v: string) => new Date(v).toLocaleString()}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="throughput" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="backlog" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="slaPct" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">SLO and Error Budget</h3>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="text-[11px] text-slate-500">SLO Target</div>
              <div className="text-white font-bold">{Number(slo?.targetPct ?? 99).toFixed(2)}%</div>
            </div>
            <div className="rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="text-[11px] text-slate-500">Current Average SLA</div>
              <div className={cn('font-bold', Number(slo?.currentAvgPct ?? 0) >= 99 ? 'text-emerald-400' : 'text-orange-400')}>
                {Number(slo?.currentAvgPct ?? 0).toFixed(2)}%
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="text-[11px] text-slate-500">Error Budget Remaining</div>
              <div className={cn('font-bold', Number(slo?.errorBudgetRemainingPct ?? 0) >= 70 ? 'text-emerald-400' : 'text-red-400')}>
                {Number(slo?.errorBudgetRemainingPct ?? 0).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4 text-sm text-slate-400">
        Explore module details:
        {' '}
        <Link href="/fi" className="text-blue-400 hover:underline">FI</Link>
        {' · '}
        <Link href="/mm" className="text-blue-400 hover:underline">MM</Link>
        {' · '}
        <Link href="/sd" className="text-blue-400 hover:underline">SD</Link>
        {' · '}
        <Link href="/pp" className="text-blue-400 hover:underline">PP</Link>
        {' · '}
        <Link href="/hcm" className="text-blue-400 hover:underline">HCM</Link>
      </div>
    </div>
  )
}
