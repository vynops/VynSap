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
    const [overview, heap, sharedMem, columnMem] = await Promise.all([
      queryErp(conn, `
        SELECT HOST,
          ROUND(ALLOCATION_LIMIT/1073741824, 2) AS LIMIT_GB,
          ROUND(TOTAL_MEMORY_USED_SIZE/1073741824, 2) AS USED_GB,
          ROUND(FREE_PHYSICAL_MEMORY/1073741824, 2) AS FREE_GB,
          ROUND(USED_PHYSICAL_MEMORY/1073741824, 2) AS PHYS_USED_GB
        FROM M_HOST_RESOURCE_UTILIZATION`),
      queryErp(conn, `
        SELECT HOST,
          ROUND(SUM(EXCLUSIVE_SIZE_IN_USE)/1073741824, 3) AS HEAP_USED_GB,
          ROUND(SUM(EXCLUSIVE_ALLOCATED_SIZE)/1073741824, 3) AS HEAP_ALLOC_GB
        FROM M_HEAP_MEMORY
        GROUP BY HOST`),
      queryErp(conn, `
        SELECT HOST,
          ROUND(SUM(PHYSICAL_SIZE)/1073741824, 3) AS SHARED_GB
        FROM M_SHARED_MEMORY
        GROUP BY HOST`),
      queryErp(conn, `
        SELECT HOST,
          ROUND(SUM(MEMORY_SIZE_IN_TOTAL)/1073741824, 3) AS CS_TOTAL_GB,
          ROUND(SUM(MEMORY_SIZE_IN_DELTA)/1073741824, 3) AS CS_DELTA_GB,
          ROUND(SUM(MEMORY_SIZE_IN_MAIN)/1073741824, 3) AS CS_MAIN_GB,
          COUNT(*) AS CS_TABLE_COUNT
        FROM M_CS_TABLES
        GROUP BY HOST`),
    ])
    return {
      connId: conn.id, connName: conn.name,
      overview: overview[0] ?? {},
      heap: heap[0] ?? {},
      shared: sharedMem[0] ?? {},
      columnStore: columnMem[0] ?? {},
    }
  }))

  return NextResponse.json(all)
}
