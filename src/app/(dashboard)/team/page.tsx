'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Users, Plus, X, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const ROLE_COLOR: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-400',
  editor: 'bg-blue-500/20 text-blue-400',
  viewer: 'bg-slate-500/20 text-slate-400',
}

export default function TeamPage() {
  const { data, mutate } = useSWR('/api/team', fetcher)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [saving, setSaving] = useState(false)

  const users = Array.isArray(data) ? data : []

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

      <div className="rounded-2xl bg-[#0f1629] border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Name</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Email</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Role</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {users.map((u: { id: string; name: string; email: string; role: string; createdAt: string }) => (
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
                  <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5', ROLE_COLOR[u.role] ?? 'bg-slate-500/20 text-slate-400')}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{u.createdAt?.slice(0, 10)}</td>
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
                <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
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
    </div>
  )
}
