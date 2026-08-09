import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { getErpAppOverview } from '@/lib/erp-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const conn = loadConnections()[0]
  if (!conn) {
    return NextResponse.json({ error: 'No ERP system connection configured' }, { status: 404 })
  }

  const overview = await getErpAppOverview(conn)
  return NextResponse.json(overview)
}
