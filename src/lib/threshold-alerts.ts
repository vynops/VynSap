import { loadSettings } from './settings-store'
import { queryErp } from './erp-client'
import type { ErpConnection } from './connection-store'

export interface ThresholdAlert {
  ALERT_ID: string
  ALERT_TIMESTAMP: string
  ALERT_RATING: number
  ALERT_DETAILS: string
  ALERT_USERACTION: string
  HOST: string
  PORT: number
  SERVICE_NAME: string
}

function rating(value: number, threshold: number): number {
  return value >= threshold * 1.1 ? 5 : 3
}

export async function getThresholdAlerts(conn: ErpConnection): Promise<ThresholdAlert[]> {
  const settings = loadSettings()
  const cpuThreshold = settings.alertThresholdCpuPct ?? 85
  const memThreshold = settings.alertThresholdMemPct ?? 90
  const diskThreshold = settings.alertThresholdDiskPct ?? 80
  const replicationThreshold = settings.alertThresholdReplicationLagSec ?? 10

  const [cpuRows, memoryRows, diskRows, replicationRows] = await Promise.all([
    queryErp(conn, 'SELECT ROUND(100 - IDLE_CPU_PCT, 1) AS CPU_USED_PCT FROM M_HOST_RESOURCE_UTILIZATION'),
    queryErp(conn, 'SELECT USED_GB, LIMIT_GB, MEM_USED_GB, MEM_LIMIT_GB FROM M_HOST_RESOURCE_UTILIZATION'),
    queryErp(conn, 'SELECT USED_PCT FROM M_DISK_USAGE'),
    queryErp(conn, 'SELECT REPLICATION_DELAY_MS FROM M_SERVICE_REPLICATION'),
  ])

  const now = new Date().toISOString()
  const alerts: ThresholdAlert[] = []
  const cpu = Number(cpuRows[0]?.CPU_USED_PCT ?? 0)
  const memoryRow = memoryRows[0] ?? {}
  const mem = Number(memoryRow.MEM_PCT ?? ((Number(memoryRow.USED_GB ?? memoryRow.MEM_USED_GB ?? 0) / Math.max(1, Number(memoryRow.LIMIT_GB ?? memoryRow.MEM_LIMIT_GB ?? 1))) * 100))
  const disk = Math.max(...diskRows.map(row => Number(row.USED_PCT ?? 0)), 0)
  const replication = Math.max(...replicationRows.map(row => Number(row.REPLICATION_DELAY_MS ?? 0) / 1000), 0)

  if (cpu >= cpuThreshold) alerts.push({ ALERT_ID: `threshold-cpu-${conn.id}`, ALERT_TIMESTAMP: now, ALERT_RATING: rating(cpu, cpuThreshold), ALERT_DETAILS: `CPU usage is ${cpu}% (threshold ${cpuThreshold}%).`, ALERT_USERACTION: 'Review active workload and expensive queries.', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'threshold-monitor' })
  if (mem >= memThreshold) alerts.push({ ALERT_ID: `threshold-memory-${conn.id}`, ALERT_TIMESTAMP: now, ALERT_RATING: rating(mem, memThreshold), ALERT_DETAILS: `Memory usage is ${mem}% (threshold ${memThreshold}%).`, ALERT_USERACTION: 'Review memory consumers and unload cold data if appropriate.', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'threshold-monitor' })
  if (disk >= diskThreshold) alerts.push({ ALERT_ID: `threshold-disk-${conn.id}`, ALERT_TIMESTAMP: now, ALERT_RATING: rating(disk, diskThreshold), ALERT_DETAILS: `Disk usage is ${disk}% (threshold ${diskThreshold}%).`, ALERT_USERACTION: 'Review disk consumers and plan capacity or cleanup.', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'threshold-monitor' })
  if (replication >= replicationThreshold) alerts.push({ ALERT_ID: `threshold-replication-${conn.id}`, ALERT_TIMESTAMP: now, ALERT_RATING: rating(replication, replicationThreshold), ALERT_DETAILS: `Replication lag is ${replication.toFixed(1)} seconds (threshold ${replicationThreshold} seconds).`, ALERT_USERACTION: 'Inspect replication health and network or standby capacity.', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'threshold-monitor' })

  return alerts
}
