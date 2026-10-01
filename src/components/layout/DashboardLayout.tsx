'use client'

import { useEffect, useState } from 'react'
import { SWRConfig, type Middleware } from 'swr'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { DemoBanner } from './DemoBanner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(30000)

  useEffect(() => {
    let active = true
    fetch('/api/settings')
      .then(response => response.json())
      .then(settings => {
        if (!active) return
        const seconds = Number(settings.defaultRefreshSec ?? 30)
        if (Number.isFinite(seconds) && seconds > 0) setRefreshInterval(Math.max(5000, seconds * 1000))
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  const refreshMiddleware: Middleware = useSWRNext => (key, fetcher, config) =>
    useSWRNext(key, fetcher, { ...config, refreshInterval })

  return (
    <SWRConfig value={{ use: [refreshMiddleware] }}>
      <div className="flex h-screen bg-[#080d1a] overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static, mobile: drawer */}
      <aside className={[
        'fixed inset-y-0 left-0 z-50 w-60 flex-shrink-0 transition-transform duration-200 lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <DemoBanner />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
      </div>
    </SWRConfig>
  )
}
