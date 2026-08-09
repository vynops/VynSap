import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const schemaFilter = searchParams.get('schema') ?? ''
  const limit = Math.min(Number(searchParams.get('limit') ?? 200), 1000)
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const schemaClause = schemaFilter ? `AND SCHEMA_NAME = '${schemaFilter.replace(/'/g, "''")}'` : `AND SCHEMA_NAME NOT IN ('SYS','SYSTEM','_SYS_BIC','_SYS_RT','_SYS_STATISTICS','_SYS_REPO')`
    const [tables, unloaded, topDelta, summary] = await Promise.all([
      queryErp(conn, `
        SELECT SCHEMA_NAME, TABLE_NAME, HOST,
          ROUND(MEMORY_SIZE_IN_TOTAL/1048576, 2) AS TOTAL_MB,
          ROUND(MEMORY_SIZE_IN_MAIN/1048576, 2) AS MAIN_MB,
          ROUND(MEMORY_SIZE_IN_DELTA/1048576, 2) AS DELTA_MB,
          RAW_RECORD_COUNT_IN_TOTAL AS ROW_COUNT,
          RAW_RECORD_COUNT_IN_DELTA AS DELTA_ROWS,
          LAST_COMPRESSED_RECORD_COUNT AS COMPRESSED_ROWS,
          IS_COLUMN_LOADABLE,
          LOADED
        FROM M_CS_TABLES
        ${schemaClause}
        ORDER BY MEMORY_SIZE_IN_TOTAL DESC
        LIMIT ${limit}`),
      queryErp(conn, `
        SELECT SCHEMA_NAME, TABLE_NAME, COUNT(*) AS UNLOAD_COUNT,
          MAX(UNLOAD_TIME) AS LAST_UNLOAD
        FROM M_CS_UNLOADS
        GROUP BY SCHEMA_NAME, TABLE_NAME
        ORDER BY UNLOAD_COUNT DESC
        LIMIT 50`),
      queryErp(conn, `
        SELECT SCHEMA_NAME, TABLE_NAME,
          RAW_RECORD_COUNT_IN_DELTA AS DELTA_ROWS,
          LAST_MERGE_TIME, MERGE_COUNT
        FROM M_CS_TABLES
        ${schemaClause}
        ORDER BY RAW_RECORD_COUNT_IN_DELTA DESC
        LIMIT 50`),
      queryErp(conn, `
        SELECT
          ROUND(SUM(MEMORY_SIZE_IN_TOTAL)/1073741824, 3) AS TOTAL_GB,
          ROUND(SUM(MEMORY_SIZE_IN_MAIN)/1073741824, 3) AS MAIN_GB,
          ROUND(SUM(MEMORY_SIZE_IN_DELTA)/1073741824, 3) AS DELTA_GB,
          COUNT(*) AS TABLE_COUNT,
          SUM(RAW_RECORD_COUNT_IN_TOTAL) AS TOTAL_ROWS,
          SUM(CASE WHEN LOADED='FULL' THEN 1 ELSE 0 END) AS FULLY_LOADED,
          SUM(CASE WHEN LOADED='NO' THEN 1 ELSE 0 END) AS UNLOADED_COUNT
        FROM M_CS_TABLES
        ${schemaClause}`),
    ])
    return { connId: conn.id, connName: conn.name, tables, unloaded, topDelta, summary: summary[0] ?? {} }
  }))

  return NextResponse.json(all)
}
