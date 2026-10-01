'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { KeyRound, Plus, X, Loader2, Eye, EyeOff, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const ROLE_COLOR: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-400',
  editor: 'bg-blue-500/20 text-blue-400',
  viewer: 'bg-slate-500/20 text-slate-400',
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
  active?: boolean
}

export default function TeamPage() {
  const { data, mutate } = useSWR('/api/team', fetcher)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [saving, setSaving] = useState(false)
  const [resetUser, setResetUser] = useState<TeamMember | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null)
  const [roleError, setRoleError] = useState('')
  const [activeSavingId, setActiveSavingId] = useState<string | null>(null)
  const [activeError, setActiveError] = useState('')
  const [deleteUser, setDeleteUser] = useState<TeamMember | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const users: TeamMember[] = Array.isArray(data) ? data : []

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowAdd(false)
    setForm({ name: '', email: '', password: '', role: 'viewer' })
    mutate()
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetUser) return
    setResetting(true)
    setResetError('')
    const response = await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: resetUser.id, password: resetPassword }),
    })
    setResetting(false)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setResetError(body.error ?? 'Unable to reset password')
      return
    }
    setResetPassword('')
    setResetUser(null)
  }

  async function handleRoleChange(user: TeamMember, role: string) {
    if (role === user.role) return
    setRoleSavingId(user.id)
    setRoleError('')
    const response = await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, role }),
    })
    setRoleSavingId(null)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setRoleError(body.error ?? 'Unable to change role')
      return
    }
    mutate()
  }

  async function handleActiveToggle(user: TeamMember) {
    const nextActive = user.active === false
    setActiveSavingId(user.id)
    setActiveError('')
    const response = await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, active: nextActive }),
    })
    setActiveSavingId(null)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setActiveError(body.error ?? 'Unable to update account status')
      return
    }
    mutate()
  }

  async function handleDelete() {
    if (!deleteUser) return
    setDeleting(true)
    setDeleteError('')
    const response = await fetch('/api/team', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: deleteUser.id }),
    })
    setDeleting(false)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setDeleteError(body.error ?? 'Unable to delete account')
      return
    }
    setDeleteUser(null)
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Team Management</h2>
          <p className="text-sm text-slate-400 mt-0.5">{users.length} members</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Member
        </button>
      </div>

      {roleError && <p className="text-xs text-red-400">{roleError}</p>}
      {activeError && <p className="text-xs text-red-400">{activeError}</p>}

      <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Name</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Email</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Role</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Status</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Created</th>
              <th className="w-24 px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-800/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-400 text-xs font-bold">{u.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="font-medium text-white">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-400 text-sm">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    disabled={roleSavingId === u.id}
                    onChange={e => handleRoleChange(u, e.target.value)}
                    title={`Change role for ${u.name}`}
                    className={cn('text-[10px] font-bold rounded-full px-2 py-0.5 border-0 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60', ROLE_COLOR[u.role] ?? 'bg-slate-500/20 text-slate-400')}
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button type="button" role="switch" aria-checked={u.active !== false} onClick={() => handleActiveToggle(u)} disabled={activeSavingId === u.id}
                    aria-label={`${u.active === false ? 'Activate' : 'Deactivate'} ${u.name}`} title={u.active === false ? 'Activate user' : 'Deactivate user'}
                    className={cn('inline-flex h-7 min-w-24 items-center justify-center gap-2 rounded-md border px-2.5 text-[10px] font-bold transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50', u.active !== false ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' : 'border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', u.active !== false ? 'bg-emerald-400' : 'bg-rose-400')} />
                    {u.active !== false ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{u.createdAt?.slice(0, 10)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setResetUser(u); setResetPassword(''); setResetError('') }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" title={`Reset password for ${u.name}`}>
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setDeleteUser(u); setDeleteError('') }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-red-400" title={`Delete ${u.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f1629] border border-slate-700 rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white">Add Team Member</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              {(['name', 'email'] as const).map(k => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1 capitalize">{k} *</label>
                  <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} required type={k === 'email' ? 'email' : 'text'}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Password *</label>
                <div className="relative">
                  <input type={showAddPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-9 text-sm text-white focus:outline-none focus:border-blue-500" />
                  <button type="button" onClick={() => setShowAddPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    title={showAddPassword ? 'Hide password' : 'Show password'}>
                    {showAddPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 border border-slate-700 text-slate-300 text-sm font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-[#0f1629] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Reset Password</h3>
                <p className="mt-0.5 text-xs text-slate-400">{resetUser.email}</p>
              </div>
              <button onClick={() => setResetUser(null)} className="text-slate-400 hover:text-white" title="Close"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handlePasswordReset} className="space-y-3">
              <div className="relative">
                <input type={showResetPassword ? 'text' : 'password'} value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Temporary password (8 characters minimum)" required minLength={8} autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 pr-9 text-sm text-white focus:border-blue-500 focus:outline-none" />
                <button type="button" onClick={() => setShowResetPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  title={showResetPassword ? 'Hide password' : 'Show password'}>
                  {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {resetError && <p className="text-xs text-red-400">{resetError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setResetUser(null)} className="flex-1 rounded-lg border border-slate-700 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">Cancel</button>
                <button type="submit" disabled={resetting} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                  {resetting && <Loader2 className="h-4 w-4 animate-spin" />}Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-[#0f1629] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Delete Team Member</h3>
                <p className="mt-0.5 text-xs text-slate-400">{deleteUser.email}</p>
              </div>
              <button onClick={() => setDeleteUser(null)} className="text-slate-400 hover:text-white" title="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-slate-400">This permanently removes {deleteUser.name}&apos;s account. This cannot be undone.</p>
            {deleteError && <p className="mt-2 text-xs text-red-400">{deleteError}</p>}
            <div className="flex gap-2 pt-4">
              <button type="button" onClick={() => setDeleteUser(null)} className="flex-1 rounded-lg border border-slate-700 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
