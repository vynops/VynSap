import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections, saveConnection, isDemoConnection } from '@/lib/connection-store'
import { getConnectorHealth, removeFromPool } from '@/lib/erp-client'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params

  const conns = loadConnections()
  const conn = conns.find(c => c.id === id)
  if (!conn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Demo-like connections are always "connected"
  if (isDemoConnection(conn)) {
    return NextResponse.json({ ok: true, isDemo: true, version: conn.version ?? '2.00.070.00', status: 'connected' })
  }

  // Force a fresh connection attempt
  removeFromPool(id)
  const connectors = await getConnectorHealth(conn)
  const failed = connectors.filter(c => c.status === 'failed').length
  const connected = connectors.filter(c => c.status === 'connected').length
  conn.status = failed === connectors.length ? 'error' : connected > 0 ? 'connected' : 'warning'
  conn.healthScore = Math.max(30, Math.min(100, Math.round((connected / connectors.length) * 100)))
  conn.version = 'ERP Application Connector Profile'
  conn.lastChecked = new Date().toISOString()
  saveConnection(conn)

  return NextResponse.json({ ok: conn.status === 'connected', conn })
}
