'use client'

import useSWR from 'swr'
import { useState, useCallback } from 'react'
import { Play, Code2, Clock, AlertCircle, CheckCircle2, History, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface QueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
  elapsed: number
  autoLimited: boolean
  error?: string
}

interface HistoryEntry {
  sql: string
  fullSql: string
  connName: string
  rowCount?: number
  elapsed?: number
  error?: string
  ts: string
}

interface ConnOption { id: string; name: string; dbType?: string }

export default function SqlConsolePage() {
  const { data: conns } = useSWR('/api/connections', fetcher)
  const hanaConns: ConnOption[] = (Array.isArray(conns) ? conns : []).filter((c: ConnOption) => (c.dbType ?? 'hana') === 'hana')

  const [connId, setConnId] = useState('')
  const [sql, setSql] = useState('SELECT SERVICE_NAME, HOST, PORT, COORDINATOR_TYPE\nFROM SYS.M_SERVICES\nORDER BY SERVICE_NAME')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const run = useCallback(async () => {
    if (!sql.trim() || !connId || loading) return
    setLoading(true)
    setResult(null)
    const connName = hanaConns.find(c => c.id === connId)?.name ?? '—'
    try {
      const res = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connId, sql }),
      })
      const data = await res.json()
      setResult({ rows: [], rowCount: 0, elapsed: 0, autoLimited: false, ...data })
      setHistory(prev => [{
        sql: sql.trim().slice(0, 120),
        fullSql: sql,
        connName,
        rowCount: data.rowCount,
        elapsed: data.elapsed,
        error: data.error,
        ts: new Date().toLocaleTimeString(),
      }, ...prev.slice(0, 19)])
    } catch {
      setResult({ rows: [], rowCount: 0, elapsed: 0, autoLimited: false, error: 'Network error.' })
    } finally {
      setLoading(false)
    }
  }, [sql, connId, hanaConns, loading])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
    }
  }

  const columns = result?.rows?.[0] ? Object.keys(result.rows[0]) : []

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">HANA SQL Console</h2>
            <p className="text-xs text-slate-500 mt-0.5">Read-only queries against a HANA connection. All runs are audited.</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={connId}
            onChange={e => setConnId(e.target.value)}
            className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
          >
            <option value="">— Select HANA connection —</option>
            {hanaConns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={run}
            disabled={!connId || !sql.trim() || loading}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run
            <span className="text-violet-300 font-normal">Ctrl+↵</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-3">
        <div className="flex flex-col flex-1 min-h-0 min-w-0 gap-3">
          <div className="rounded-xl border border-slate-700 bg-[#0a0e1a] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/40">
              <Code2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500 font-mono">SQL Editor</span>
              <span className="ml-auto text-[10px] text-slate-600">SELECT / WITH only · auto-limited to 500 rows</span>
            </div>
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              rows={8}
              className="w-full bg-transparent px-4 py-3 text-sm font-mono text-slate-200 placeholder-slate-700 resize-none focus:outline-none leading-relaxed"
              placeholder="SELECT * FROM SYS.M_SERVICES"
            />
          </div>

          <div className="flex-1 min-h-0 rounded-xl border border-slate-800 bg-[#0f1629] overflow-hidden flex flex-col">
            {!result && !loading && (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                {hanaConns.length === 0 ? 'Add a HANA connection under ERP Systems to use the console' : 'Run a query to see results here'}
              </div>
            )}
            {loading && (
              <div className="flex-1 flex items-center justify-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-violet-400" /> Executing…
              </div>
            )}
            {result && !loading && (
              <>
                <div className={cn(
                  'flex items-center gap-2 px-4 py-2 text-xs border-b border-slate-800',
                  result.error ? 'text-red-400' : 'text-emerald-400'
                )}>
                  {result.error
                    ? <><AlertCircle className="w-3.5 h-3.5" /> Error</>
                    : <><CheckCircle2 className="w-3.5 h-3.5" /> {result.rowCount} row{result.rowCount !== 1 ? 's' : ''}</>}
                  {result.elapsed != null && (
                    <span className="flex items-center gap-1 text-slate-500"><Clock className="w-3 h-3" />{result.elapsed}ms</span>
                  )}
                  {result.autoLimited && <span className="ml-auto text-amber-500">Auto-limited to 500 rows</span>}
                </div>

                {result.error ? (
                  <div className="px-4 py-3 font-mono text-xs text-red-400 whitespace-pre-wrap">{result.error}</div>
                ) : columns.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-slate-500 text-center">Query executed successfully. No rows returned.</div>
                ) : (
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900/90">
                        <tr>
                          {columns.map(col => (
                            <th key={col} className="text-left px-3 py-2 font-semibold text-slate-400 border-b border-slate-800 whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {result.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                            {columns.map(col => (
                              <td key={col} className="px-3 py-1.5 font-mono text-slate-300 whitespace-nowrap max-w-xs truncate">
                                {row[col] == null ? <span className="text-slate-600">NULL</span> : String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="w-64 flex-shrink-0 rounded-xl border border-slate-800 bg-[#0f1629] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-400">History</span>
            <span className="ml-auto text-[10px] text-slate-600">{history.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
            {history.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-600">Queries appear here after execution</div>
            ) : history.map((h, i) => (
              <button key={i} onClick={() => setSql(h.fullSql)} className="w-full text-left px-3 py-3 hover:bg-slate-800/40 transition-colors group">
                <div className="flex items-center gap-1 mb-1">
                  {h.error
                    ? <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                    : <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                  <span className="text-[10px] text-slate-600">{h.ts}</span>
                  <ChevronRight className="w-3 h-3 text-slate-700 ml-auto group-hover:text-slate-400" />
                </div>
                <div className="font-mono text-[11px] text-slate-400 truncate">{h.sql}</div>
                {!h.error && h.rowCount != null && (
                  <div className="text-[10px] text-slate-600 mt-0.5">{h.connName} · {h.rowCount} rows · {h.elapsed}ms</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
