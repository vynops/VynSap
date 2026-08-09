'use client'

import useSWR from 'swr'
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
  const rows = Array.isArray(data) ? data : []

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
      ) : rows.map((r: {
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

        return (
          <div key={r.connId} className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-emerald-400">{succeeded}</div>
                <div className="text-xs text-slate-500">Successful</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className={cn('text-xl font-black', failed > 0 ? 'text-red-400' : 'text-slate-400')}>{failed}</div>
                <div className="text-xs text-slate-500">Failed</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xl font-black text-blue-400">{totalGB.toFixed(1)} GB</div>
                <div className="text-xs text-slate-500">Total Size</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className="text-xs font-black text-white">{lastBackup ? String(lastBackup.SYS_START_TIME ?? '').slice(0, 16) : '—'}</div>
                <div className="text-xs text-slate-500">Last Backup</div>
              </div>
              <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
                <div className={cn('text-xl font-black', Number(r.kpis?.restoreDrillSuccessRatePct ?? 100) < 90 ? 'text-yellow-400' : 'text-emerald-400')}>
                  {Number(r.kpis?.restoreDrillSuccessRatePct ?? 100).toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500">Restore Drill Success</div>
                <div className="text-[10px] text-slate-600 mt-1">{r.kpis?.lastRestoreDrillAt ? String(r.kpis.lastRestoreDrillAt).slice(0, 16) : 'N/A'}</div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400">Backup Catalog</span>
                <span className="ml-2 text-[10px] text-slate-600">{catalog.length} entries</span>
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
                    {catalog.map((c, i) => {
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
