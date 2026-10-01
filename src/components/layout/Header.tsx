'use client'

import Link from 'next/link'
import { Bell, KeyRound, Loader2, LogOut, Menu, RefreshCw, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const TITLES: Record<string, string> = {
  '/overview':     'ERP Application Overview',
  '/tenants':      'ERP System Connections',
  '/services':     'Connector Health',
  '/apm':          'Application Performance Monitoring',
  '/alerts':       'Alert Center',
  '/fi':           'FI Module',
  '/mm':           'MM Module',
  '/sd':           'SD Module',
  '/pp':           'PP Module',
  '/hcm':          'HCM Module',
  '/incidents':    'Incident Management',
  '/oncall':       'On-Call',
  '/sla':          'SLA Tracker',
  '/automation':   'Automation',
  '/autonomous':   'Autonomous Ops',
  '/security':     'Security & Audit',
  '/copilot':      'AI Copilot',
  '/team':         'Team',
  '/settings':     'Settings',
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const title = TITLES[pathname] ?? 'VynSAP'
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setSavingPassword(true)
    setPasswordError('')
    const response = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passwords),
    })
    setSavingPassword(false)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setPasswordError(body.error ?? 'Unable to change password')
      return
    }
    setPasswords({ currentPassword: '', newPassword: '' })
    setShowPasswordForm(false)
  }

  return (
    <header className="h-14 flex items-center gap-4 px-4 border-b border-slate-800/60 bg-[#0a1020]/80 backdrop-blur-sm flex-shrink-0">
      <button onClick={onMenuClick} className="text-slate-400 hover:text-white lg:hidden">
        <Menu className="w-5 h-5" />
      </button>
      <h1 className="text-base font-semibold text-white flex-1">{title}</h1>
      <div className="flex items-center gap-1">
        <button
          onClick={() => router.refresh()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-white"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <Link
          href="/incidents"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-white"
          title="Incidents"
        >
          <Bell className="w-4 h-4" />
        </Link>
        <button
          onClick={() => setShowPasswordForm(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-white"
          title="Change password"
        >
          <KeyRound className="w-4 h-4" />
        </button>
        <button
          onClick={handleLogout}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-red-400"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span>SAP ERP</span>
      </div>
      {showPasswordForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-[#0f1629] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Change Password</h2>
              <button onClick={() => setShowPasswordForm(false)} className="text-slate-400 hover:text-white" title="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <input type="password" value={passwords.currentPassword} onChange={e => setPasswords(value => ({ ...value, currentPassword: e.target.value }))} placeholder="Current password" required autoComplete="current-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
              <input type="password" value={passwords.newPassword} onChange={e => setPasswords(value => ({ ...value, newPassword: e.target.value }))} placeholder="New password (8 characters minimum)" required minLength={8} autoComplete="new-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
              {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowPasswordForm(false)} className="flex-1 rounded-lg border border-slate-700 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800">Cancel</button>
                <button type="submit" disabled={savingPassword} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
