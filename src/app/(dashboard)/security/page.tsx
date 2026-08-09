'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Shield, Users, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())
type Tab = 'users' | 'roles' | 'grants' | 'audit'

export default function SecurityPage() {
  const { data, isLoading } = useSWR('/api/security', fetcher, { refreshInterval: 60000 })
  const [tab, setTab] = useState<Tab>('users')
  const rows = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Security & Audit</h2>
        <p className="text-sm text-slate-400 mt-0.5">ERP database users, roles, privileges, and audit policies</p>
      </div>

      <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1 w-fit">
        {(['users', 'roles', 'grants', 'audit'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-3 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize',
              tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            )}>
            {t === 'grants' ? 'Privileges' : t === 'audit' ? 'Audit' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-slate-600 text-sm py-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">No connections.</div>
      ) : rows.map((r: {
        connId: string; connName: string
        users: Record<string, unknown>[]; roles: Record<string, unknown>[]
        grants: Record<string, unknown>[]; auditPolicies: Record<string, unknown>[]
      }) => (
        <div key={r.connId} className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{r.connName}</h3>
          <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
            {tab === 'users' && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Username</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Status</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Last Login</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-bold">Failed Logins</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Password Policy</th>
                    <th className="text-center px-4 py-2 text-slate-500 font-bold">Restricted</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {(r.users ?? []).map((u, i) => (
                    <tr key={i} className="hover:bg-slate-800/20">
                      <td className="px-4 py-2 font-bold text-white">{String(u.USER_NAME)}</td>
                      <td className="px-4 py-2">
                        <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5',
                          String(u.USER_STATUS) === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        )}>{String(u.USER_STATUS)}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-400">{String(u.LAST_SUCCESSFUL_CONNECT ?? '—').slice(0, 16)}</td>
                      <td className={cn('px-4 py-2 text-right font-bold', Number(u.INVALID_CONNECT_ATTEMPTS ?? 0) > 0 ? 'text-red-400' : 'text-slate-500')}>
                        {String(u.INVALID_CONNECT_ATTEMPTS ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-slate-400">{String(u.PASSWORD_POLICY ?? '—')}</td>
                      <td className="px-4 py-2 text-center text-slate-400">{String(u.IS_RESTRICTED ?? '?')}</td>
                      <td className="px-4 py-2 text-slate-600">{String(u.CREATE_TIME ?? '').slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'roles' && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Role Name</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Mode</th>
                    <th className="text-center px-4 py-2 text-slate-500 font-bold">Enabled</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {(r.roles ?? []).map((role, i) => (
                    <tr key={i} className="hover:bg-slate-800/20">
                      <td className="px-4 py-2 font-medium text-white">{String(role.ROLE_NAME)}</td>
                      <td className="px-4 py-2 text-slate-400">{String(role.ROLE_MODE ?? '—')}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5',
                          String(role.IS_ENABLED) === 'TRUE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                        )}>{String(role.IS_ENABLED)}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{String(role.CREATE_TIME ?? '').slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'grants' && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Grantee</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Privilege</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Object Type</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Schema.Object</th>
                    <th className="text-center px-4 py-2 text-slate-500 font-bold">Grantable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {(r.grants ?? []).slice(0, 100).map((g, i) => (
                    <tr key={i} className="hover:bg-slate-800/20">
                      <td className="px-4 py-2 font-medium text-white">{String(g.GRANTEE)}</td>
                      <td className="px-4 py-2 text-blue-400 font-bold">{String(g.PRIVILEGE)}</td>
                      <td className="px-4 py-2 text-slate-400">{String(g.OBJECT_TYPE ?? '—')}</td>
                      <td className="px-4 py-2 text-slate-400">{String(g.SCHEMA_NAME ?? '')}{g.OBJECT_NAME ? `.${String(g.OBJECT_NAME)}` : ''}</td>
                      <td className="px-4 py-2 text-center text-slate-400">{String(g.IS_GRANTABLE ?? 'NO')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'audit' && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Policy Name</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Status</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Audit Level</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Trail Type</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-bold">Retention (days)</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-bold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {(r.auditPolicies ?? []).map((p, i) => (
                    <tr key={i} className="hover:bg-slate-800/20">
                      <td className="px-4 py-2 font-medium text-white">{String(p.POLICY_NAME)}</td>
                      <td className="px-4 py-2">
                        <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5',
                          String(p.STATUS) === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                        )}>{String(p.STATUS)}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-400">{String(p.AUDIT_LEVEL ?? '—')}</td>
                      <td className="px-4 py-2 text-slate-400">{String(p.TRAIL_TYPE ?? '—')}</td>
                      <td className="px-4 py-2 text-right text-slate-300">{String(p.RETENTION_DAY ?? '—')}</td>
                      <td className="px-4 py-2 text-slate-600">{String(p.CREATE_TIME ?? '').slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
