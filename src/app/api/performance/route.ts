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
    const [cpuRows, memRows, ioRows, connRows] = await Promise.all([
      queryErp(conn, `
        SELECT HOST, ROUND(100 - IDLE_CPU_PCT, 1) AS CPU_USED_PCT,
          OPEN_FILE_COUNT, SWAP_SPACE_USED/1024/1024 AS SWAP_MB
        FROM M_HOST_RESOURCE_UTILIZATION`),
      queryErp(conn, `
        SELECT HOST,
          ROUND(USED_PHYSICAL_MEMORY/1024/1024/1024, 2) AS MEM_USED_GB,
          ROUND(FREE_PHYSICAL_MEMORY/1024/1024/1024, 2) AS MEM_FREE_GB,
          ROUND(ALLOCATION_LIMIT/1024/1024/1024, 2) AS MEM_LIMIT_GB,
          ROUND(TOTAL_MEMORY_USED_SIZE/1024/1024/1024, 2) AS ERP_USED_GB
        FROM M_HOST_RESOURCE_UTILIZATION`),
      queryErp(conn, `
        SELECT HOST, ROUND(SUM(TOTAL_READ_SIZE)/1024/1024, 1) AS READ_MB,
          ROUND(SUM(TOTAL_WRITE_SIZE)/1024/1024, 1) AS WRITE_MB,
          SUM(TOTAL_READ_COUNT) AS READ_OPS, SUM(TOTAL_WRITE_COUNT) AS WRITE_OPS
        FROM M_VOLUME_IO_TOTAL_STATISTICS GROUP BY HOST`),
      queryErp(conn, `
        SELECT COUNT(*) AS TOTAL_CONN,
          SUM(CASE WHEN CONNECTION_STATUS='RUNNING' THEN 1 ELSE 0 END) AS RUNNING,
          SUM(CASE WHEN CONNECTION_STATUS='IDLE' THEN 1 ELSE 0 END) AS IDLE
        FROM M_CONNECTIONS`),
    ])
    return {
      connId: conn.id, connName: conn.name,
      cpu: cpuRows[0] ?? {},
      memory: memRows[0] ?? {},
      io: ioRows[0] ?? {},
      connections: connRows[0] ?? {},
    }
  }))

  return NextResponse.json(all)
}
