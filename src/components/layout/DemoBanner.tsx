'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { FlaskConical, X, ArrowRight } from 'lucide-react'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

/**
 * DemoBanner — shown automatically when ALL connections are synthetic (demo).
 * Disappears the moment the first real ERP system connection is added.
 */
export function DemoBanner() {
  const { data } = useSWR('/api/connections', fetcher, { refreshInterval: 5000 })
  const [dismissed, setDismissed] = useState(false)

  // Show banner only when every connection is a demo placeholder
  const connections = Array.isArray(data) ? data : []
  const isDemo = connections.length > 0 && connections.every((c: { _isDemo?: boolean }) => c._isDemo)

  if (!isDemo || dismissed) return null

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-950/60 border-b border-amber-500/25 flex-shrink-0">
      {/* Animated badge */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <div className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 rounded-md px-2 py-0.5">
          <FlaskConical className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-black tracking-widest text-amber-400 uppercase">Demo</span>
        </div>
      </div>

      {/* Message */}
      <p className="flex-1 text-xs text-amber-200/80 min-w-0">
        You&apos;re viewing <span className="font-semibold text-amber-300">simulated data</span> — realistic SAP ERP stats for demonstration purposes only.
        Connect a real ERP system to see live metrics.
      </p>

      {/* CTA */}
      <Link
        href="/settings"
        className="flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors flex-shrink-0"
      >
        Add Connection <ArrowRight className="w-3 h-3" />
      </Link>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-600 hover:text-amber-400 transition-colors flex-shrink-0 ml-1"
        title="Dismiss (will reappear on next page load)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
