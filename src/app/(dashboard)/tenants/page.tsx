'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Database, Plus, X, Loader2, Trash2, RefreshCw, CheckCircle2, XCircle, Edit2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Conn {
  id: string; name: string; host: string; port: number
  connectorType: 'odata' | 'rfc' | 'bapi'; endpointUrl: string
  sapClient: string; systemNumber: string; language: string
  authType: 'basic' | 'oauth2' | 'saml'; username: string
  environment: string; status: string; healthScore: number
  version: string; tags: string[]; lastChecked: string; notes: string; ssl: boolean
  freshnessLagMins?: number | null; freshnessState?: 'fresh' | 'aging' | 'stale' | 'unknown'
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5',
      status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' :
      status === 'error' ? 'bg-red-500/20 text-red-400' :
      'bg-slate-500/20 text-slate-400'
    )}>{status}</span>
  )
}

export default function TenantsPage() {
  const { data, isLoading, mutate } = useSWR('/api/connections', fetcher)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    name: '',
    connectorType: 'odata',
    endpointUrl: 'https://erp-host.example.com/sap/opu/odata',
    sapClient: '100',
    systemNumber: '00',
    language: 'EN',
    authType: 'basic',
    username: 'ERP_API_USER',
    password: '',
    ssl: true,
    sslValidateCert: true,
    environment: 'production',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, boolean>>({})

  const conns: Conn[] = Array.isArray(data) ? data : []
  const lagValues = conns.map(c => Number(c.freshnessLagMins)).filter(v => Number.isFinite(v))
  const avgLag = lagValues.length === 0 ? null : lagValues.reduce((n, x) => n + x, 0) / lagValues.length
  const staleCount = conns.filter(c => c.freshnessState === 'stale').length

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowAdd(false)
    mutate()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this ERP system connection?')) return
    await fetch(`/api/connections/${id}`, { method: 'DELETE' })
    mutate()
  }

  async function handleTest(id: string) {
    setTesting(id)
    const r = await fetch(`/api/connections/${id}/test`, { method: 'POST' })
    const d = await r.json()
    setTestResult(prev => ({ ...prev, [id]: d.ok }))
    setTesting(null)
    mutate()
  }

  const f = (k: keyof typeof form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">ERP System Connections</h2>
          <p className="text-sm text-slate-400 mt-0.5">Manage SAP ERP application-layer connectors (OData, RFC, BAPI)</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Connection
        </button>
      </div>

      {/* Connection list */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-white">{conns.length}</div>
          <div className="text-xs text-slate-500">Connectors</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className={cn('text-xl font-black', (avgLag ?? 0) > 30 ? 'text-red-400' : (avgLag ?? 0) > 5 ? 'text-yellow-400' : 'text-emerald-400')}>
            {avgLag == null ? 'N/A' : `${avgLag.toFixed(1)}m`}
          </div>
          <div className="text-xs text-slate-500">Avg Freshness Lag</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className={cn('text-xl font-black', staleCount > 0 ? 'text-red-400' : 'text-emerald-400')}>{staleCount}</div>
          <div className="text-xs text-slate-500">Stale Connectors</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-blue-400">{conns.filter(c => c.status === 'connected').length}</div>
          <div className="text-xs text-slate-500">Connected</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /><span>Loading…</span>
        </div>
      ) : conns.length === 0 ? (
        <div className="rounded-2xl bg-[#0f1629] border border-slate-800 p-10 text-center">
          <Database className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No connections yet. Add your first ERP system.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {conns.map(conn => {
            return (
              <div key={conn.id} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      {conn.name}
                      <StatusBadge status={conn.status} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {conn.connectorType.toUpperCase()} · Client {conn.sapClient} · Sys {conn.systemNumber}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 truncate">{conn.endpointUrl}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleTest(conn.id)} disabled={testing === conn.id}
                      className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors" title="Test connection">
                      {testing === conn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleDelete(conn.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-800/40 rounded-lg py-2">
                    <div className="text-sm font-bold text-white">{conn.healthScore}</div>
                    <div className="text-[10px] text-slate-500">Health</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg py-2">
                    <div className="text-sm font-bold text-white capitalize">{conn.environment}</div>
                    <div className="text-[10px] text-slate-500">Env</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg py-2">
                    <div className="text-sm font-bold text-white uppercase">{conn.authType}</div>
                    <div className="text-[10px] text-slate-500">Auth</div>
                  </div>
                </div>

                <div className="mt-3 text-[10px] text-slate-600">
                  {conn.version || 'Version unknown'} · Freshness: {conn.freshnessLagMins == null ? 'N/A' : `${conn.freshnessLagMins}m`} ({conn.freshnessState ?? 'unknown'})
                </div>

                {conn.id in testResult && (
                  <div className={cn('mt-2 text-xs flex items-center gap-1',
                    testResult[conn.id] ? 'text-emerald-400' : 'text-red-400')}>
                    {testResult[conn.id] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {testResult[conn.id] ? 'Connection successful' : 'Connection failed'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add connection modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1629] border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white">Add ERP System Connection</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Display Name *</label>
                  <input value={form.name} onChange={e => f('name', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="Production ERP OData Gateway" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Connector Type *</label>
                  <select value={form.connectorType} onChange={e => f('connectorType', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="odata">OData</option>
                    <option value="rfc">RFC</option>
                    <option value="bapi">BAPI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Environment</label>
                  <select value={form.environment} onChange={e => f('environment', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                    <option value="test">Test</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Endpoint URL *</label>
                  <input value={form.endpointUrl} onChange={e => f('endpointUrl', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="https://erp-host.example.com/sap/opu/odata" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">SAP Client (MANDT) *</label>
                  <input value={form.sapClient} onChange={e => f('sapClient', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">System Number *</label>
                  <input value={form.systemNumber} onChange={e => f('systemNumber', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Language</label>
                  <input value={form.language} onChange={e => f('language', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="EN" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Auth Type</label>
                  <select value={form.authType} onChange={e => f('authType', e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="basic">Basic</option>
                    <option value="oauth2">OAuth2</option>
                    <option value="saml">SAML</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Username *</label>
                  <input value={form.username} onChange={e => f('username', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="ERP_API_USER" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Password *</label>
                  <input type="password" value={form.password} onChange={e => f('password', e.target.value)} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.ssl} onChange={e => f('ssl', e.target.checked)} className="accent-blue-500" />
                  <span className="text-slate-300">SSL/TLS</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Optional notes…" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Adding…' : 'Add Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
