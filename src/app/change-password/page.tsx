'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(String(result.error ?? 'Password change failed.'))
        return
      }
      router.replace('/overview')
      router.refresh()
    } catch {
      setError('Could not reach VynSAP. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#080d1a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-white">Change your password</h1>
          <p className="text-sm text-slate-400 mt-2 text-center">Set a new password before continuing to VynSAP.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl bg-[#0f1629] border border-slate-800 p-6 space-y-4">
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <label className="block text-xs font-semibold text-slate-400">
            Current password
            <input autoComplete="current-password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required
              className="mt-1.5 w-full bg-[#080d1a] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
          </label>
          <label className="block text-xs font-semibold text-slate-400">
            New password
            <input autoComplete="new-password" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={8} required
              className="mt-1.5 w-full bg-[#080d1a] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
          </label>
          <label className="block text-xs font-semibold text-slate-400">
            Confirm new password
            <input autoComplete="new-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} required
              className="mt-1.5 w-full bg-[#080d1a] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
          </label>
          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    </main>
  )
}