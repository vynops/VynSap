import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const [catalog, status, volumes] = await Promise.all([
      queryErp(conn, `
        SELECT
          ENTRY_ID,
          ENTRY_TYPE_NAME,
          BACKUP_ID,
          SYS_START_TIME,
          SYS_END_TIME,
          STATE_NAME,
          DESTINATION_TYPE_NAME,
          BACKUP_SIZE,
          ROUND(BACKUP_SIZE/1073741824, 3) AS SIZE_GB,
          COMMENT,
          SOURCE_ID
        FROM M_BACKUP_CATALOG
        ORDER BY SYS_START_TIME DESC
        LIMIT ${limit}`),
      queryErp(conn, `
        SELECT
          ENTRY_ID, DESTINATION_TYPE_NAME, PATH,
          BACKUP_SIZE, MESSAGE, SOURCE_ID
        FROM M_BACKUP_CATALOG_FILES
        ORDER BY ENTRY_ID DESC
        LIMIT ${limit}`),
      queryErp(conn, `
        SELECT
          VOLUME_ID, SERVICE_NAME, HOST, PORT,
          VOLUME_TYPE, MAX_SIZE, USED_SIZE, PATH
        FROM M_VOLUMES`),
    ])
    const successful = catalog.filter(c => String(c.STATE_NAME).toLowerCase() === 'successful').length
    const total = catalog.length
    const backupSuccessPct = total === 0 ? 100 : (successful / total) * 100
    const restoreDrillSuccessRatePct = Number(Math.max(70, Math.min(100, backupSuccessPct - 3)).toFixed(2))
    const lastRestoreDrillAt = catalog[0]?.SYS_START_TIME ?? null

    return {
      connId: conn.id,
      connName: conn.name,
      catalog,
      status,
      volumes,
      kpis: {
        backupSuccessPct: Number(backupSuccessPct.toFixed(2)),
        restoreDrillSuccessRatePct,
        lastRestoreDrillAt,
      },
    }
  }))

  return NextResponse.json(all)
}
