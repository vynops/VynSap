import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const [expensive, planCache, stats] = await Promise.all([
      queryErp(conn, `
        SELECT
          STATEMENT_HASH,
          SUBSTR(STATEMENT_STRING, 1, 500) AS SQL_TEXT,
          EXECUTION_COUNT,
          ROUND(TOTAL_EXECUTION_TIME/1000000, 3) AS TOTAL_SEC,
          ROUND(AVG_EXECUTION_TIME/1000000, 3) AS AVG_SEC,
          ROUND(MAX_EXECUTION_TIME/1000000, 3) AS MAX_SEC,
          ROUND(TOTAL_CURSOR_DURATION/1000000, 3) AS CURSOR_SEC,
          TOTAL_LOCK_WAIT_COUNT,
          TOTAL_RESULT_RECORD_COUNT,
          SCHEMA_NAME,
          USER_NAME,
          OPERATION,
          LAST_EXECUTION_TIMESTAMP
        FROM M_SQL_PLAN_CACHE
        WHERE EXECUTION_COUNT > 0
        ORDER BY TOTAL_EXECUTION_TIME DESC
        LIMIT ${limit}`),
      queryErp(conn, `
        SELECT
          SCHEMA_NAME,
          PLAN_CACHE_HITS,
          PLAN_CACHE_MISSES,
          ROUND(PLAN_CACHE_SIZE/1048576, 2) AS CACHE_SIZE_MB,
          PLAN_CACHE_CAPACITY,
          PLAN_CACHE_EVICTIONS
        FROM M_SQL_PLAN_CACHE_OVERVIEW
        LIMIT 1`),
      queryErp(conn, `
        SELECT
          ROUND(SUM(TOTAL_EXECUTION_TIME)/1000000/1000, 1) AS TOTAL_CPU_MIN,
          SUM(EXECUTION_COUNT) AS TOTAL_EXECUTIONS,
          COUNT(DISTINCT STATEMENT_HASH) AS UNIQUE_STATEMENTS,
          COUNT(DISTINCT USER_NAME) AS UNIQUE_USERS
        FROM M_SQL_PLAN_CACHE`),
    ])
    return { connId: conn.id, connName: conn.name, expensive, planCache: planCache[0] ?? {}, stats: stats[0] ?? {} }
  }))

  return NextResponse.json(all)
}
