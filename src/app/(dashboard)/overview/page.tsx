'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { AlertTriangle, BarChart3, CheckCircle2, Network, RefreshCw, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const MODULE_ROUTES: Record<string, string> = {
  FI: '/fi', MM: '/mm', SD: '/sd', PP: '/pp', HCM: '/hcm',
}
const PROCESS_ROUTES: Record<string, string> = {
  orderToCash: '/sd', procureToPay: '/mm', recordToReport: '/fi', hireToRetire: '/hcm',
}
const sapOperationsFetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('SAP operations feed unavailable')
  return response.json()
}

function StatCard({ label, value, sub, color = 'text-white', icon: Icon, href }: {
  label: string; value: string | number; sub?: string; color?: string
  icon: React.ComponentType<{ className?: string }>; href?: string
}) {
  const inner = (
    <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5 transition-colors hover:border-blue-500/50">
      <Icon className={cn('w-5 h-5 mb-3', color)} />
      <div className={cn('text-2xl font-black', color)}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
    </div>
  )
  if (href) return <Link href={href} aria-label={`Open ${label} details`} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">{inner}</Link>
  return inner
}

export default function OverviewPage() {
  const { data, isLoading, mutate } = useSWR('/api/erp-overview', fetcher, { refreshInterval: 30000 })
  const { data: processData } = useSWR('/api/processes', fetcher, { refreshInterval: 30000 })
  const { data: connectionsData } = useSWR('/api/connections', fetcher, { refreshInterval: 30000 })
  const { data: sapOperations, error: sapOperationsError } = useSWR('/api/sap-operations', sapOperationsFetcher, { refreshInterval: 30000 })

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
  const businessTelemetryAvailable = data?.dataQuality === 'demo'
  const sapSources = Array.isArray(sapOperations?.sources) ? sapOperations.sources : []

  return (
    <div className="space-y-6">
      {data?.dataQuality === 'live-infrastructure-only' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Live database infrastructure telemetry is connected. SAP business-process telemetry is not configured for this data source.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Source Health" value={`${connectedConnectors}/${connectors.length}`} sub={data?.dataQuality === 'live-infrastructure-only' ? 'Database connection' : 'OData / RFC / BAPI'} color="text-blue-400" icon={Network} href="/tenants" />
        <StatCard label="Process Failures" value={businessTelemetryAvailable ? totalFailures : 'N/A'} sub="Requires SAP business telemetry" color="text-slate-400" icon={AlertTriangle} href="/incidents" />
        <StatCard label="Queue Backlog" value={businessTelemetryAvailable ? totalBacklog : 'N/A'} sub="Requires SAP business telemetry" color="text-slate-400" icon={BarChart3} href="/automation" />
        <StatCard label="Average SLA" value={businessTelemetryAvailable ? `${avgSla.toFixed(2)}%` : 'N/A'} sub="Requires SAP business telemetry" color="text-slate-400" icon={CheckCircle2} href="/sla" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/tenants" aria-label="Open ERP systems and connector freshness" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"><div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4 h-full transition-colors hover:border-blue-500/50">
          <div className="text-[11px] text-slate-500">Connector Freshness Lag</div>
          <div className={cn('text-lg font-black mt-1', (avgFreshnessLag ?? 0) > 30 ? 'text-red-400' : (avgFreshnessLag ?? 0) > 5 ? 'text-yellow-400' : 'text-emerald-400')}>
            {avgFreshnessLag === null ? 'N/A' : `${avgFreshnessLag.toFixed(1)}m`}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">Average connector data age</div>
        </div></Link>
        <Link href="/sla" aria-label="Open SLA tracker for SLO burn rate" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"><div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4 h-full transition-colors hover:border-blue-500/50">
          <div className="text-[11px] text-slate-500">SLO Burn Rate</div>
          <div className={cn('text-lg font-black mt-1', businessTelemetryAvailable ? 'text-emerald-400' : 'text-slate-400')}>
            {businessTelemetryAvailable ? `${Number(slo?.burnRate1h ?? 1).toFixed(2)}x / ${Number(slo?.burnRate6h ?? 1).toFixed(2)}x` : 'N/A'}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">1h and 6h burn multipliers</div>
        </div></Link>
        <Link href="/sla" aria-label="Open SLA tracker for error budget exhaustion" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"><div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4 h-full transition-colors hover:border-blue-500/50">
          <div className="text-[11px] text-slate-500">Error Budget Exhaustion</div>
          <div className="text-lg font-black mt-1 text-blue-400">{businessTelemetryAvailable ? `${Number(slo?.exhaustionForecastHours ?? 0).toFixed(1)}h` : 'N/A'}</div>
          <div className="text-[10px] text-slate-600 mt-1">Projected time to budget exhaustion</div>
        </div></Link>
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
              Business-process telemetry is unavailable for the configured database source.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {processes.map((p: {
              key: string; label: string; throughput: number; failed: number; backlog: number; avgCycleMins: number; slaPct: number
            }) => {
              const href = PROCESS_ROUTES[p.key]
              const card = (
                <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5 transition-colors hover:border-blue-500/50">
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
              )
              return href ? <Link key={p.key} href={href} aria-label={`Open ${p.label} module details`} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">{card}</Link> : <div key={p.key}>{card}</div>
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div>
          <h2 className="text-base font-semibold text-white mb-3">Module Health</h2>
          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 divide-y divide-slate-800">
            {modules.length === 0 ? <div className="px-4 py-8 text-sm text-slate-500 text-center">SAP module telemetry is not configured for this data source.</div> : modules.map((m: { code: string; name: string; availabilityPct: number; queueBacklog: number; failedTransactions: number }) => {
              const row = (
              <div className="px-4 py-3 flex items-center gap-3 text-sm transition-colors hover:bg-slate-800/30">
                <span className="font-semibold text-slate-300 w-14">{m.code}</span>
                <span className="text-slate-400 flex-1">{m.name}</span>
                <span className="text-emerald-400 text-xs">{m.availabilityPct}%</span>
                <span className="text-yellow-400 text-xs">Q:{m.queueBacklog}</span>
                <span className="text-red-400 text-xs">F:{m.failedTransactions}</span>
              </div>
              )
              const href = MODULE_ROUTES[m.code]
              return href ? <Link key={m.code} href={href} aria-label={`Open ${m.code} module details`} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">{row}</Link> : <div key={m.code}>{row}</div>
            })}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-3">Open Business Events</h2>
          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 divide-y divide-slate-800">
            {events.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500 text-center">No business-event source is configured.</div>
            ) : (
              events.map((e: { id: string; module: string; severity: string; title: string; ageMins: number }) => (
                <Link key={e.id} href="/alerts" aria-label={`Open alerts for ${e.module}: ${e.title}`} className="px-4 py-3 flex items-center gap-3 text-sm transition-colors hover:bg-slate-800/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-slate-700 text-slate-200">{e.module}</span>
                  <span className="text-slate-300 flex-1">{e.title}</span>
                  <span className={cn(
                    'text-[10px] font-bold rounded-full px-2 py-0.5',
                    e.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    e.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    e.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-300'
                  )}>{e.severity}</span>
                  <span className="text-slate-500 text-xs">{e.ageMins}m</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <section className="rounded-2xl bg-[#0f1629] border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">SAP Application Operations</h2>
          <Link href="/tenants" className="text-xs text-blue-400 hover:underline">Manage connections</Link>
        </div>
        {sapOperationsError ? <p className="text-sm text-slate-500">Sign in to load SAP application feeds.</p> : sapOperations?.configured !== true ? (
          <p className="text-sm text-slate-500">No SAP application OData source is configured.</p>
        ) : sapSources.length === 0 ? <p className="text-sm text-slate-500">No SAP application feed returned data.</p> : (
          <div className="space-y-4">{sapSources.map((source: {
            connectionId: string; name: string; status: string; checkedAt: string
            jobs: { JobName: string; Status: string }[]
            interfaces: { InterfaceId: string; Direction?: string; Status: string; Backlog?: number }[]
          }) => (
            <div key={source.connectionId} className="border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between mb-3 text-sm"><span className="font-medium text-white">{source.name}</span><span className={source.status === 'connected' ? 'text-emerald-400' : 'text-red-400'}>{source.status}</span></div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div><h3 className="text-xs font-bold text-slate-400 mb-2">Background Jobs</h3>{source.jobs.length === 0 ? <p className="text-xs text-slate-600">No job records.</p> : source.jobs.map(job => <div key={job.JobName} className="flex items-center justify-between gap-3 border-t border-slate-800/60 py-2 text-xs"><span className="text-slate-300">{job.JobName}</span><span className={/fail|error/i.test(job.Status) ? 'text-red-400' : 'text-emerald-400'}>{job.Status}</span></div>)}</div>
                <div><h3 className="text-xs font-bold text-slate-400 mb-2">Interfaces</h3>{source.interfaces.length === 0 ? <p className="text-xs text-slate-600">No interface records.</p> : source.interfaces.map(item => <div key={item.InterfaceId} className="flex items-center justify-between gap-3 border-t border-slate-800/60 py-2 text-xs"><span className="text-slate-300">{item.InterfaceId} · {item.Direction ?? '—'}</span><span className={/fail|error/i.test(item.Status) ? 'text-red-400' : item.Backlog ? 'text-yellow-400' : 'text-emerald-400'}>{item.Status}{item.Backlog ? ` · ${item.Backlog} queued` : ''}</span></div>)}</div>
              </div>
              <p className="mt-2 text-[10px] text-slate-600">Last read: {new Date(source.checkedAt).toLocaleString()}</p>
            </div>
          ))}</div>
        )}
      </section>

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
              <div className="text-white font-bold">{businessTelemetryAvailable ? `${Number(slo?.targetPct ?? 99).toFixed(2)}%` : 'N/A'}</div>
            </div>
            <div className="rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="text-[11px] text-slate-500">Current Average SLA</div>
              <div className={cn('font-bold', Number(slo?.currentAvgPct ?? 0) >= 99 ? 'text-emerald-400' : 'text-orange-400')}>
                {businessTelemetryAvailable ? `${Number(slo?.currentAvgPct ?? 0).toFixed(2)}%` : 'N/A'}
              </div>
            </div>
            <div className="rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="text-[11px] text-slate-500">Error Budget Remaining</div>
              <div className={cn('font-bold', Number(slo?.errorBudgetRemainingPct ?? 0) >= 70 ? 'text-emerald-400' : 'text-red-400')}>
                {businessTelemetryAvailable ? `${Number(slo?.errorBudgetRemainingPct ?? 0).toFixed(2)}%` : 'N/A'}
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
