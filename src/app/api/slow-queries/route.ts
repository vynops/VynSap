import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const minSec = Number(searchParams.get('minSec') ?? 5)
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const rows = await queryErp(conn, `
      SELECT
        STATEMENT_HASH,
        SUBSTR(STATEMENT_STRING, 1, 1000) AS SQL_TEXT,
        USER_NAME,
        APPLICATION_NAME,
        SCHEMA_NAME,
        ROUND(TOTAL_EXECUTION_TIME/1000000, 3) AS TOTAL_SEC,
        ROUND(AVG_EXECUTION_TIME/1000000, 3) AS AVG_SEC,
        ROUND(MAX_EXECUTION_TIME/1000000, 3) AS MAX_SEC,
        EXECUTION_COUNT,
        TOTAL_RESULT_RECORD_COUNT,
        TOTAL_LOCK_WAIT_COUNT,
        TOTAL_CALLED_THREAD_COUNT,
        LAST_EXECUTION_TIMESTAMP,
        OPERATION
      FROM M_SQL_PLAN_CACHE
      WHERE AVG_EXECUTION_TIME > ${minSec * 1000000}
        AND EXECUTION_COUNT > 0
      ORDER BY AVG_EXECUTION_TIME DESC
      LIMIT ${limit}
    `)
    return rows.map(r => ({ connId: conn.id, connName: conn.name, ...r }))
  }))

  return NextResponse.json(all.flat())
}
