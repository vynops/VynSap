'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { HardDrive, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const TYPE_COLOR: Record<string, string> = {
  'COMPLETE DATA BACKUP': 'text-blue-400',
  'INCREMENTAL DATA BACKUP': 'text-cyan-400',
  'LOG BACKUP': 'text-purple-400',
  'DATA SNAPSHOT': 'text-emerald-400',
}

export default function BackupsPage() {
  const { data, isLoading } = useSWR('/api/backups', fetcher, { refreshInterval: 60000 })
  const [backupFilter, setBackupFilter] = useState<{ connectionId: string | null; state: 'all' | 'successful' | 'failed' | 'latest' }>({ connectionId: null, state: 'all' })
  const rows = Array.isArray(data) ? data : []
  const visibleRows = backupFilter.connectionId ? rows.filter((row: { connId: string }) => row.connId === backupFilter.connectionId) : rows

  function selectBackupFilter(connectionId: string, state: typeof backupFilter.state) {
    setBackupFilter(current => current.connectionId === connectionId && current.state === state
      ? { connectionId: null, state: 'all' }
      : { connectionId, state })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Backup Management</h2>
        <p className="text-sm text-slate-400 mt-0.5">ERP database backup catalog from M_BACKUP_CATALOG</p>
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading backup catalog…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">No connections.</div>
      ) : visibleRows.map((r: {
        connId: string; connName: string
        catalog: Record<string, unknown>[]
        volumes: Record<string, unknown>[]
        kpis?: { backupSuccessPct?: number; restoreDrillSuccessRatePct?: number; lastRestoreDrillAt?: string | null }
      }) => {
        const catalog = r.catalog ?? []
        const succeeded = catalog.filter(c => String(c.STATE_NAME) === 'successful').length
        const failed = catalog.filter(c => String(c.STATE_NAME) !== 'successful').length
        const totalGB = catalog.reduce((s, c) => s + Number(c.SIZE_GB ?? 0), 0)
        const lastBackup = catalog[0]
        const displayedCatalog = catalog.filter((entry, index) => backupFilter.connectionId !== r.connId || backupFilter.state === 'all' || (backupFilter.state === 'latest'
          ? index === 0
          : backupFilter.state === 'successful'
            ? String(entry.STATE_NAME) === 'successful'
            : String(entry.STATE_NAME) !== 'successful'))

        return (
          <div key={r.connId} className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <button type="button" onClick={() => selectBackupFilter(r.connId, 'successful')} aria-pressed={backupFilter.connectionId === r.connId && backupFilter.state === 'successful'} aria-label={`Filter to successful backups for ${r.connName}`} className={`w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${backupFilter.connectionId === r.connId && backupFilter.state === 'successful' ? 'ring-1 ring-emerald-500/70' : ''}`}><div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center transition-colors hover:border-emerald-500/50">
                <div className="text-xl font-black text-emerald-400">{succeeded}</div>
                <div className="text-xs text-slate-500">Successful</div>
              </div></button>
              <button type="button" onClick={() => selectBackupFilter(r.connId, 'failed')} aria-pressed={backupFilter.connectionId === r.connId && backupFilter.state === 'failed'} aria-label={`Filter to failed backups for ${r.connName}`} className={`w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${backupFilter.connectionId === r.connId && backupFilter.state === 'failed' ? 'ring-1 ring-red-500/70' : ''}`}><div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center transition-colors hover:border-red-500/50">
                <div className={cn('text-xl font-black', failed > 0 ? 'text-red-400' : 'text-slate-400')}>{failed}</div>
                <div className="text-xs text-slate-500">Failed</div>
              </div></button>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-blue-400">{totalGB.toFixed(1)} GB</div>
                <div className="text-xs text-slate-500">Total Size</div>
              </div>
              <button type="button" onClick={() => selectBackupFilter(r.connId, 'latest')} aria-pressed={backupFilter.connectionId === r.connId && backupFilter.state === 'latest'} aria-label={`Filter to the latest backup for ${r.connName}`} className={`w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${backupFilter.connectionId === r.connId && backupFilter.state === 'latest' ? 'ring-1 ring-blue-500/70' : ''}`}><div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center transition-colors hover:border-blue-500/50">
                <div className="text-xs font-black text-white">{lastBackup ? String(lastBackup.SYS_START_TIME ?? '').slice(0, 16) : '—'}</div>
                <div className="text-xs text-slate-500">Last Backup</div>
              </div></button>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className={cn('text-xl font-black', Number(r.kpis?.restoreDrillSuccessRatePct ?? 100) < 90 ? 'text-yellow-400' : 'text-emerald-400')}>
                  {Number(r.kpis?.restoreDrillSuccessRatePct ?? 100).toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500">Restore Drill Success</div>
                <div className="text-[10px] text-slate-600 mt-1">{r.kpis?.lastRestoreDrillAt ? String(r.kpis.lastRestoreDrillAt).slice(0, 16) : 'N/A'}</div>
              </div>
            </div>

            <div id={`backup-catalog-${r.connId}`} className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden scroll-mt-6">
              <div className="px-4 py-3 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400">Backup Catalog</span>
                <span className="ml-2 text-[10px] text-slate-600">{displayedCatalog.length} of {catalog.length} entries</span>
                {backupFilter.connectionId === r.connId && <button type="button" onClick={() => setBackupFilter({ connectionId: null, state: 'all' })} className="ml-auto text-[10px] text-blue-400 hover:underline">Clear filter</button>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Type</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Start</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">End</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Status</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Size GB</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Destination</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {displayedCatalog.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{catalog.length === 0 ? 'No backup records available.' : `No ${backupFilter.state} backups match this filter.`}</td></tr>
                    )}
                    {displayedCatalog.map((c, i) => {
                      const ok = String(c.STATE_NAME) === 'successful'
                      return (
                        <tr key={i} className="hover:bg-slate-800/20">
                          <td className={cn('px-4 py-2 font-medium', TYPE_COLOR[String(c.ENTRY_TYPE_NAME)] ?? 'text-slate-300')}>
                            {String(c.ENTRY_TYPE_NAME ?? '—')}
                          </td>
                          <td className="px-4 py-2 text-slate-400">{String(c.SYS_START_TIME ?? '').slice(0, 16)}</td>
                          <td className="px-4 py-2 text-slate-400">{String(c.SYS_END_TIME ?? '').slice(0, 16)}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                              <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{String(c.STATE_NAME)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-white font-bold">{Number(c.SIZE_GB ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-slate-500">{String(c.DESTINATION_TYPE_NAME ?? '—')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
