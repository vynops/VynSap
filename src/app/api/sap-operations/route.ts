import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { getSapOperations } from '@/lib/sap-odata'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const requestedId = searchParams.get('connectionId')
  const connections = loadConnections().filter(conn => conn.dbType === 'sap-odata' && (!requestedId || conn.id === requestedId))
  const sources = await Promise.all(connections.map(async conn => {
    try {
      const operations = await getSapOperations(conn)
      return { connectionId: conn.id, name: conn.name, status: 'connected', ...operations }
    } catch {
      return { connectionId: conn.id, name: conn.name, status: 'error', checkedAt: new Date().toISOString(), jobs: [], interfaces: [] }
    }
  }))

  return NextResponse.json({ generatedAt: new Date().toISOString(), configured: sources.length > 0, sources })
}