'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Table2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Tab = 'tables' | 'views' | 'procedures' | 'functions' | 'schemas'

export default function SchemaPage() {
  const { data, isLoading } = useSWR('/api/schema', fetcher)
  const [tab, setTab] = useState<Tab>('tables')
  const [filter, setFilter] = useState('')
  const rows = Array.isArray(data) ? data : []

  const tabs: { key: Tab; label: string }[] = [
    { key: 'tables', label: 'Tables' },
    { key: 'views', label: 'Views' },
    { key: 'procedures', label: 'Procedures' },
    { key: 'functions', label: 'Functions' },
    { key: 'schemas', label: 'Schemas' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Schema Explorer</h2>
          <p className="text-sm text-slate-400 mt-0.5">Browse ERP database catalog objects</p>
        </div>
        <div className="ml-auto relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter name…"
            className="bg-slate-800/60 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 w-44" />
        </div>
      </div>

      <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
              tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading catalog…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">No ERP system connections.</div>
      ) : rows.map((r: {
        connId: string; connName: string
        tables: Record<string, unknown>[]; views: Record<string, unknown>[]
        procedures: Record<string, unknown>[]; functions: Record<string, unknown>[]; schemas: Record<string, unknown>[]
      }) => {
        const lf = filter.toLowerCase()
        const filterRows = (items: Record<string, unknown>[], key: string) =>
          items.filter(i => !filter || String(i[key] ?? '').toLowerCase().includes(lf))

        return (
          <div key={r.connId}>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">{r.connName}</h3>
            <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
              {tab === 'tables' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema</th>
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Table Name</th>
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Type</th>
                        <th className="text-right px-4 py-2 text-slate-500 font-bold">Columns</th>
                        <th className="text-center px-4 py-2 text-slate-500 font-bold">Column Table</th>
                        <th className="text-left px-4 py-2 text-slate-500 font-bold">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filterRows(r.tables ?? [], 'TABLE_NAME').slice(0, 200).map((t, i) => (
                        <tr key={i} className="hover:bg-slate-800/20">
                          <td className="px-4 py-2 text-slate-500">{String(t.SCHEMA_NAME)}</td>
                          <td className="px-4 py-2 font-medium text-white">{String(t.TABLE_NAME)}</td>
                          <td className="px-4 py-2 text-slate-400">{String(t.TABLE_TYPE ?? '')}</td>
                          <td className="px-4 py-2 text-right text-slate-300">{String(t.COLUMN_COUNT ?? '—')}</td>
                          <td className="px-4 py-2 text-center">
                            {String(t.IS_COLUMN_TABLE) === 'TRUE'
                              ? <span className="text-[10px] bg-blue-500/20 text-blue-400 rounded px-1.5 py-0.5 font-bold">Column</span>
                              : <span className="text-[10px] bg-slate-500/20 text-slate-400 rounded px-1.5 py-0.5 font-bold">Row</span>}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{String(t.CREATE_TIME ?? '').slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {tab === 'views' && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">View Name</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Type</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filterRows(r.views ?? [], 'VIEW_NAME').map((v, i) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 text-slate-500">{String(v.SCHEMA_NAME)}</td>
                        <td className="px-4 py-2 font-medium text-white">{String(v.VIEW_NAME)}</td>
                        <td className="px-4 py-2 text-slate-400">{String(v.VIEW_TYPE ?? '')}</td>
                        <td className="px-4 py-2 text-slate-600">{String(v.CREATE_TIME ?? '').slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === 'procedures' && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Procedure</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">In Params</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-bold">Out Params</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filterRows(r.procedures ?? [], 'PROCEDURE_NAME').map((p, i) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 text-slate-500">{String(p.SCHEMA_NAME)}</td>
                        <td className="px-4 py-2 font-medium text-white">{String(p.PROCEDURE_NAME)}</td>
                        <td className="px-4 py-2 text-right text-slate-400">{String(p.INPUT_PARAMETER_COUNT ?? 0)}</td>
                        <td className="px-4 py-2 text-right text-slate-400">{String(p.OUTPUT_PARAMETER_COUNT ?? 0)}</td>
                        <td className="px-4 py-2 text-slate-600">{String(p.CREATE_TIME ?? '').slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === 'functions' && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Function</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Type</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filterRows(r.functions ?? [], 'FUNCTION_NAME').map((f, i) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 text-slate-500">{String(f.SCHEMA_NAME)}</td>
                        <td className="px-4 py-2 font-medium text-white">{String(f.FUNCTION_NAME)}</td>
                        <td className="px-4 py-2 text-slate-400">{String(f.FUNCTION_TYPE ?? '')}</td>
                        <td className="px-4 py-2 text-slate-600">{String(f.CREATE_TIME ?? '').slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === 'schemas' && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema Name</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-bold">Owner</th>
                      <th className="text-center px-4 py-2 text-slate-500 font-bold">Has Privileges</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filterRows(r.schemas ?? [], 'SCHEMA_NAME').map((s, i) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-2 font-medium text-white">{String(s.SCHEMA_NAME)}</td>
                        <td className="px-4 py-2 text-slate-400">{String(s.OWNER_NAME ?? '—')}</td>
                        <td className="px-4 py-2 text-center text-slate-400">{String(s.HAS_PRIVILEGES ?? '?')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
