'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Database, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        router.push('/overview')
        router.refresh()
      } else {
        const d = await res.json()
        setError(d.error ?? 'Login failed')
      }
    } catch {
      setError('Network error — try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080d1a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
            <Database className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">VynSAP</h1>
          <p className="text-slate-500 text-sm mt-1">SAP ERP Operations Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-8 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-[#080d1a] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="admin@vynsap.local"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full bg-[#080d1a] border border-slate-700 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="mt-3 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3">
          <p className="mb-1 text-[11px] font-semibold text-slate-400">First-time setup</p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Set <span className="rounded bg-slate-800 px-1 text-blue-400">VYNSAP_ADMIN_EMAIL</span> and{' '}
            <span className="rounded bg-slate-800 px-1 text-blue-400">VYNSAP_ADMIN_PASSWORD</span> in{' '}
            <span className="rounded bg-slate-800 px-1 text-slate-400">.env.local</span> — the admin account is created automatically on first boot.
          </p>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-600">
          Part of the <span className="text-slate-500 font-medium">VynOps Suite</span>
        </p>
      </div>
    </div>
  )
}
