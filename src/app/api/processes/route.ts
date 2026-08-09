import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { getErpAppOverview, getProcessTrends } from '@/lib/erp-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const conn = loadConnections()[0]
  if (!conn) {
    return NextResponse.json({ error: 'No ERP system connection configured' }, { status: 404 })
  }

  const overview = await getErpAppOverview(conn)
  const trends = getProcessTrends(conn)
  const bottlenecks = [...overview.processes]
    .sort((a, b) => (b.failed + b.backlog) - (a.failed + a.backlog))
    .slice(0, 3)

  const slo = {
    targetPct: 99,
    currentAvgPct: Number((overview.processes.reduce((n, p) => n + p.slaPct, 0) / overview.processes.length).toFixed(2)),
    errorBudgetRemainingPct: Number(Math.max(0, 100 - (bottlenecks.reduce((n, p) => n + p.failed, 0) * 1.1)).toFixed(2)),
    burnRate1h: Number((1 + bottlenecks.reduce((n, p) => n + p.failed, 0) / 18).toFixed(2)),
    burnRate6h: Number((1 + bottlenecks.reduce((n, p) => n + p.backlog, 0) / 140).toFixed(2)),
    exhaustionForecastHours: Number((Math.max(0, 100 - (bottlenecks.reduce((n, p) => n + p.failed, 0) * 1.1)) / Math.max(0.25, 1 + bottlenecks.reduce((n, p) => n + p.failed, 0) / 18)).toFixed(1)),
  }

  return NextResponse.json({
    generatedAt: overview.generatedAt,
    system: overview.system,
    processes: overview.processes,
    bottlenecks,
    trends,
    slo,
  })
}
