'use client'

import Link from 'next/link'
import { Bell, LogOut, Menu, RefreshCw } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

const TITLES: Record<string, string> = {
  '/overview':     'ERP Application Overview',
  '/tenants':      'ERP System Connections',
  '/services':     'Connector Health',
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

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
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
    </header>
  )
}
