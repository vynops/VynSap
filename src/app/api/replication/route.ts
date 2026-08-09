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

  const all = await Promise.all(conns.map(async conn => {
    const [status, sites, log] = await Promise.all([
      queryErp(conn, `
        SELECT
          SYSTEM_REPLICATION_SITE_ID AS SITE_ID,
          SITE_NAME,
          HOST,
          PORT,
          VOLUME_ID,
          REPLICATION_MODE,
          REPLICATION_STATUS,
          REPLICATION_STATUS_DETAILS,
          SECONDARY_HOST,
          SECONDARY_PORT,
          SECONDARY_FULLY_SYNCED,
          ROUND(SHIPPED_LOG_POSITION_SIZE/1048576, 2) AS SHIPPED_LOG_MB,
          ROUND(REPLICATED_LOG_POSITION_SIZE/1048576, 2) AS REPLICATED_LOG_MB,
          ASYNC_BUFFER_FULL_COUNT,
          REPLICATION_DELAY_MS
        FROM M_SERVICE_REPLICATION`),
      queryErp(conn, `
        SELECT SITE_ID, SITE_NAME, REPLICATION_MODE,
          FAILOVER_STATUS, FAILOVER_TIME, OPERATION_MODE
        FROM M_SYSTEM_REPLICATION_SITES`),
      queryErp(conn, `
        SELECT HOST, PORT, VOLUME_ID,
          ROUND(SHIPPED_LOG_POSITION/1048576, 2) AS SHIPPED_MB,
          ROUND(REPLICATED_LOG_POSITION/1048576, 2) AS REPLICATED_MB,
          SHIPPED_SAVEPOINT_ID, REPLICATED_SAVEPOINT_ID,
          REPLICATION_STATUS
        FROM M_SERVICE_REPLICATION
        LIMIT 20`),
    ])
    const lagMsList = status.map(s => Number(s.REPLICATION_DELAY_MS ?? 0)).filter(n => Number.isFinite(n) && n >= 0)
    const avgLagMs = lagMsList.length === 0 ? 0 : lagMsList.reduce((n, x) => n + x, 0) / lagMsList.length
    const maxLagMs = lagMsList.length === 0 ? 0 : Math.max(...lagMsList)
    const rpoTargetSec = 60
    const rpoCompliantServices = lagMsList.filter(ms => ms / 1000 <= rpoTargetSec).length
    const rpoCompliancePct = lagMsList.length === 0 ? 100 : (rpoCompliantServices / lagMsList.length) * 100

    return {
      connId: conn.id,
      connName: conn.name,
      status,
      sites,
      log,
      kpis: {
        rpoTargetSec,
        avgLagSec: Number((avgLagMs / 1000).toFixed(2)),
        maxLagSec: Number((maxLagMs / 1000).toFixed(2)),
        rpoCompliancePct: Number(rpoCompliancePct.toFixed(2)),
      },
    }
  }))

  return NextResponse.json(all)
}
