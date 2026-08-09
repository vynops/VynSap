import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  // For MDC: list all tenant databases from SYSTEMDB
  const all = await Promise.all(conns.map(async conn => {
    const [tenants, tenantStatus] = await Promise.all([
      queryErp(conn, `
        SELECT DATABASE_NAME, DESCRIPTION, ACTIVE_STATUS,
          HOST, SQL_PORT, INDEXSERVER_ACTUAL_ROLE,
          CURRENT_STATEMENT_COUNT, START_TIME
        FROM SYS_DATABASES
        ORDER BY DATABASE_NAME`),
      queryErp(conn, `
        SELECT
          DATABASE_NAME,
          STATUS,
          DETAIL
        FROM M_DATABASES
        ORDER BY DATABASE_NAME`),
    ])
    return { connId: conn.id, connName: conn.name, tenants, tenantStatus }
  }))

  return NextResponse.json(all)
}
