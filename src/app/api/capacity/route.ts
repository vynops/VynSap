import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { appendCapacitySnapshots, getCapacityGrowth } from '@/lib/telemetry-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const connId = searchParams.get('connId')
  const conns = loadConnections().filter(c => !connId || c.id === connId)

  const all = await Promise.all(conns.map(async conn => {
    const [disk, volumes, dataArea] = await Promise.all([
      queryErp(conn, `
        SELECT HOST, USAGE_TYPE, PATH,
          ROUND(TOTAL_SIZE/1073741824, 2) AS TOTAL_GB,
          ROUND(USED_SIZE/1073741824, 2) AS USED_GB,
          ROUND(FREE_SIZE/1073741824, 2) AS FREE_GB,
          ROUND(USED_SIZE*100.0/NULLIF(TOTAL_SIZE,0), 1) AS USED_PCT
        FROM M_DISK_USAGE
        ORDER BY USED_PCT DESC`),
      queryErp(conn, `
        SELECT VOLUME_ID, SERVICE_NAME, HOST, PORT, VOLUME_TYPE,
          ROUND(MAX_SIZE/1073741824, 2) AS MAX_GB,
          ROUND(USED_SIZE/1073741824, 2) AS USED_GB,
          PATH
        FROM M_VOLUMES
        ORDER BY USED_SIZE DESC`),
      queryErp(conn, `
        SELECT HOST,
          ROUND(DATA_VOLUME_TOTAL/1073741824, 2) AS DATA_VOL_TOTAL_GB,
          ROUND(DATA_VOLUME_USED/1073741824, 2) AS DATA_VOL_USED_GB,
          ROUND(LOG_VOLUME_TOTAL/1073741824, 2) AS LOG_VOL_TOTAL_GB,
          ROUND(LOG_VOLUME_USED/1073741824, 2) AS LOG_VOL_USED_GB
        FROM M_DISK_VOLUME_STATISTICS`),
    ])
    const usedPct = disk.map(d => Number(d.USED_PCT ?? 0)).filter(v => Number.isFinite(v) && v >= 0)
    const peakUsedPct = usedPct.length === 0 ? 0 : Math.max(...usedPct)

    appendCapacitySnapshots([{
      connId: conn.id,
      peakUsedPct,
      at: new Date().toISOString(),
    }])

    const growth = getCapacityGrowth(conn.id, 7)
    const dailyGrowthPct = growth.dailyGrowthPct
    const daysToExhaustion = growth.daysToExhaustion
    const projectedExhaustionAt = daysToExhaustion === null
      ? null
      : new Date(Date.now() + daysToExhaustion * 24 * 3600 * 1000).toISOString()

    return {
      connId: conn.id,
      connName: conn.name,
      disk,
      volumes,
      dataArea,
      kpis: {
        peakUsedPct: Number(peakUsedPct.toFixed(2)),
        dailyGrowthPct,
        daysToExhaustion,
        projectedExhaustionAt,
        sampleCount7d: growth.sampleCount,
      },
    }
  }))

  return NextResponse.json(all)
}
