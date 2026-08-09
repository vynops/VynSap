import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const schemaFilter = searchParams.get('schema')
  const objectType = searchParams.get('type') ?? 'TABLE'
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const schemaWhere = schemaFilter
      ? `AND SCHEMA_NAME = '${schemaFilter.replace(/'/g, "''")}'`
      : `AND SCHEMA_NAME NOT IN ('SYS','SYSTEM','_SYS_BIC','_SYS_RT','_SYS_STATISTICS','_SYS_REPO')`

    const [tables, views, procedures, functions, schemas] = await Promise.all([
      queryErp(conn, `
        SELECT SCHEMA_NAME, TABLE_NAME, TABLE_TYPE, COLUMN_COUNT,
          COMMENT, CREATE_TIME, IS_COLUMN_TABLE, IS_TEMPORARY
        FROM TABLES
        WHERE IS_SYSTEM_TABLE='FALSE' ${schemaWhere}
        ORDER BY SCHEMA_NAME, TABLE_NAME
        LIMIT 500`),
      queryErp(conn, `
        SELECT SCHEMA_NAME, VIEW_NAME, VIEW_TYPE, COMMENT, CREATE_TIME
        FROM VIEWS
        WHERE 1=1 ${schemaWhere}
        ORDER BY SCHEMA_NAME, VIEW_NAME
        LIMIT 200`),
      queryErp(conn, `
        SELECT SCHEMA_NAME, PROCEDURE_NAME, INPUT_PARAMETER_COUNT,
          OUTPUT_PARAMETER_COUNT, INOUT_PARAMETER_COUNT, CREATE_TIME, DEFINITION
        FROM PROCEDURES
        WHERE 1=1 ${schemaWhere}
        ORDER BY SCHEMA_NAME, PROCEDURE_NAME
        LIMIT 200`),
      queryErp(conn, `
        SELECT SCHEMA_NAME, FUNCTION_NAME, FUNCTION_TYPE,
          INPUT_PARAMETER_COUNT, CREATE_TIME
        FROM FUNCTIONS
        WHERE 1=1 ${schemaWhere}
        ORDER BY SCHEMA_NAME, FUNCTION_NAME
        LIMIT 200`),
      queryErp(conn, `
        SELECT SCHEMA_NAME, OWNER_NAME, HAS_PRIVILEGES
        FROM SCHEMAS
        WHERE SCHEMA_NAME NOT IN ('SYS','SYSTEM','_SYS_BIC','_SYS_RT','_SYS_STATISTICS','_SYS_REPO')
        ORDER BY SCHEMA_NAME`),
    ])
    return { connId: conn.id, connName: conn.name, tables, views, procedures, functions, schemas }
  }))

  return NextResponse.json(all)
}
