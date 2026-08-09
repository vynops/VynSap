/**
 * Redis adapter — translates M_* patterns to Redis INFO / SLOWLOG commands.
 */
import Redis from 'ioredis'
import type { ErpConnection } from '../connection-store'
import { decryptPassword } from '../connection-store'

type Row = Record<string, unknown>

const clients = new Map<string, Redis>()

function getClient(conn: ErpConnection): Redis {
  const existing = clients.get(conn.id)
  if (existing && existing.status === 'ready') return existing
  const pwd = decryptPassword(conn.passwordEnc)
  const client = new Redis({
    host: conn.host,
    port: conn.port || 6379,
    password: pwd || undefined,
    connectTimeout: 5000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  })
  clients.set(conn.id, client)
  return client
}

function parseInfo(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split('\r\n')) {
    const i = line.indexOf(':')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

export async function queryRedis(conn: ErpConnection, sql: string): Promise<Row[]> {
  const client = getClient(conn)
  const U = sql.replace(/\s+/g, ' ').toUpperCase()

  const raw = await client.info('all')
  const info = parseInfo(raw)

  const usedMemMb  = +(Number(info.used_memory) / 1048576).toFixed(2)
  const maxMemMb   = info.maxmemory !== '0' ? +(Number(info.maxmemory) / 1048576).toFixed(2) : usedMemMb * 4
  const freeMemMb  = +(maxMemMb - usedMemMb).toFixed(2)
  const usedMemGb  = +(usedMemMb / 1024).toFixed(3)
  const maxMemGb   = +(maxMemMb  / 1024).toFixed(3)
  const freeMemGb  = +(freeMemMb / 1024).toFixed(3)
  const opsPerSec  = Number(info.instantaneous_ops_per_sec ?? 0)
  const hitRate    = Number(info.keyspace_hits ?? 0) / Math.max(1, Number(info.keyspace_hits ?? 0) + Number(info.keyspace_misses ?? 0)) * 100
  const clients_ct = Number(info.connected_clients ?? 0)
  const version    = info.redis_version ?? 'unknown'

  // ── M_DATABASE ──────────────────────────────────────────────────────────────
  if (U.includes('M_DATABASE') && !U.includes('M_DATABASES')) {
    return [{ SYSTEM_ID: 'REDIS', VERSION: version, USAGE: 'PRODUCTION', ACTIVE_STATUS: 'YES', HOST: conn.host, SVC: 1 }]
  }

  // ── M_HOST_RESOURCE_UTILIZATION ──────────────────────────────────────────────
  if (U.includes('M_HOST_RESOURCE_UTILIZATION')) {
    if (U.includes('IDLE_CPU_PCT')) {
      const cpuPct = Math.min(94, +(opsPerSec / 10).toFixed(1))
      return [{ HOST: conn.host, CPU_USED_PCT: cpuPct, OPEN_FILE_COUNT: Number(info.connected_clients ?? 0), SWAP_MB: 0 }]
    }
    return [{ HOST: conn.host, LIMIT_GB: maxMemGb, USED_GB: usedMemGb, FREE_GB: freeMemGb, PHYS_USED_GB: usedMemGb, MEM_USED_GB: usedMemGb, MEM_FREE_GB: freeMemGb, MEM_LIMIT_GB: maxMemGb, ERP_USED_GB: usedMemGb }]
  }

  // ── M_CONNECTIONS ────────────────────────────────────────────────────────────
  if (U.includes('M_CONNECTIONS')) {
    const blocked = Number(info.blocked_clients ?? 0)
    return [{ TOTAL_CONN: clients_ct, RUNNING: opsPerSec > 0 ? 1 : 0, IDLE: clients_ct - blocked }]
  }

  // ── M_SERVICES ──────────────────────────────────────────────────────────────
  if (U.includes('M_SERVICES') && U.includes('COUNT(*)')) {
    return [{ SVC_COUNT: 1, ACTIVE_COUNT: Number(info.connected_clients ?? 0) }]
  }
  if (U.includes('M_SERVICES')) {
    return [{ SERVICE_NAME: 'redis-server', HOST: conn.host, PORT: conn.port, ACTIVE_STATUS: 'YES', SQL_EXECUTION_COUNT: Number(info.total_commands_processed ?? 0), MEM_USED_MB: usedMemMb, CPU_SEC: 0, CONNECTION_COUNT: clients_ct, TRANSACTION_COUNT: 0, START_TIME: null, COORDINATOR_TYPE: 'COORDINATOR' }]
  }

  // ── M_SQL_PLAN_CACHE (slow log) ───────────────────────────────────────────────
  if (U.includes('M_SQL_PLAN_CACHE') || U.includes('M_EXPENSIVE_STATEMENTS')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slowlog = await (client as any).slowlog('get', '20') as unknown[][]
      return (slowlog as [number, number, number, string[]][]).map((entry, i) => ({
        STATEMENT_HASH: String(entry[0] ?? i),
        STATEMENT_STRING: (entry[3] ?? []).join(' ').slice(0, 500),
        AVG_EXECUTION_TIME: (entry[2] ?? 0) * 1000,
        TOTAL_EXECUTION_TIME: (entry[2] ?? 0) * 1000,
        MAX_EXECUTION_TIME: (entry[2] ?? 0) * 1000,
        EXECUTION_COUNT: 1,
        TOTAL_RESULT_RECORD_COUNT: 0,
      }))
    } catch { return [] }
  }

  // ── M_CS_TABLES (keyspaces as table proxy) ────────────────────────────────────
  if (U.includes('M_CS_TABLES')) {
    const keyspaceKeys = Object.keys(info).filter(k => k.startsWith('db'))
    const tables: Row[] = keyspaceKeys.map(k => {
      const parts = info[k].split(',')
      const keysMatch = parts[0]?.match(/keys=(\d+)/)
      const keys = keysMatch ? Number(keysMatch[1]) : 0
      if (U.includes('GROUP BY HOST')) return null
      return { SCHEMA_NAME: k, TABLE_NAME: k, ROW_COUNT: keys, MEMORY_SIZE_IN_TOTAL: usedMemGb / Math.max(1, keyspaceKeys.length), MEMORY_SIZE_IN_MAIN: usedMemGb / Math.max(1, keyspaceKeys.length), MEMORY_SIZE_IN_DELTA: 0, WRITE_COUNT: 0, READ_COUNT: 0 }
    }).filter(Boolean) as Row[]
    if (U.includes('GROUP BY HOST')) {
      return [{ HOST: conn.host, CS_TOTAL_GB: usedMemGb, CS_DELTA_GB: 0, CS_MAIN_GB: usedMemGb, CS_TABLE_COUNT: keyspaceKeys.length }]
    }
    return tables
  }

  // ── M_ALERTS ─────────────────────────────────────────────────────────────────
  if (U.includes('M_ALERTS') && !U.includes('M_ALERT_DEFINITIONS')) {
    const alerts: Row[] = []
    const memPct = (usedMemMb / maxMemMb) * 100
    if (memPct > 85) alerts.push({ ALERT_ID: 1, ALERT_TIMESTAMP: new Date().toISOString(), ALERT_RATING: memPct > 95 ? 5 : 4, ALERT_DETAILS: `Memory usage at ${memPct.toFixed(1)}%`, ALERT_USERACTION: 'Investigate memory growth or increase maxmemory', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'redis-server' })
    if (hitRate < 70) alerts.push({ ALERT_ID: 2, ALERT_TIMESTAMP: new Date().toISOString(), ALERT_RATING: 3, ALERT_DETAILS: `Cache hit rate low: ${hitRate.toFixed(1)}%`, ALERT_USERACTION: 'Review eviction policy and key TTLs', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'redis-server' })
    return alerts
  }

  if (U.includes('M_ALERT_DEFINITIONS')) {
    return [
      { ALERT_ID: 1, ALERT_NAME: 'Memory Pressure', ALERT_DESCRIPTION: 'Used memory approaching maxmemory', ALERT_CATEGORY: 'RESOURCES', DEFAULT_THRESHOLD_WARNING_VALUE: 85, DEFAULT_THRESHOLD_CRITICAL_VALUE: 95, UNIT: 'pct' },
      { ALERT_ID: 2, ALERT_NAME: 'Low Hit Rate', ALERT_DESCRIPTION: 'Cache hit rate below threshold', ALERT_CATEGORY: 'PERFORMANCE', DEFAULT_THRESHOLD_WARNING_VALUE: 80, DEFAULT_THRESHOLD_CRITICAL_VALUE: 70, UNIT: 'pct' },
    ]
  }

  // ── Disk / backup / replication (Redis has none of these) ───────────────────
  if (U.includes('SYS_DATABASES') || U.includes('M_DATABASES')) {
    const keyspaceKeys = Object.keys(info).filter(k => k.startsWith('db'))
    return keyspaceKeys.map(k => ({ DATABASE_NAME: k, DESCRIPTION: k, ACTIVE_STATUS: 'YES', HOST: conn.host, SQL_PORT: conn.port, INDEXSERVER_ACTUAL_ROLE: 'MASTER', CURRENT_STATEMENT_COUNT: 0, START_TIME: null, STATUS: 'YES', DETAIL: '' }))
  }

  if (U.includes('FROM USERS') || U.includes('USER_NAME')) { return [{ USER_NAME: 'default', USER_STATUS: 'ACTIVE', LAST_SUCCESSFUL_CONNECT: null, LAST_INVALID_CONNECT_ATTEMPT: null, INVALID_CONNECT_ATTEMPTS: 0, PASSWORD_CHANGE_TIME: null, PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'FALSE', IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'FALSE', CREATOR: 'SYSTEM', CREATE_TIME: null }] }

  // Stubs for fields redis doesn't have
  if (U.includes('M_HEAP_MEMORY')) return [{ HOST: conn.host, HEAP_USED_GB: usedMemGb, HEAP_ALLOC_GB: usedMemGb }]
  if (U.includes('M_SHARED_MEMORY')) return [{ HOST: conn.host, SHARED_GB: 0 }]
  if (U.includes('M_DISK_USAGE') || U.includes('M_VOLUMES') || U.includes('M_DISK_VOLUME_STATISTICS')) return []
  if (U.includes('M_SERVICE_REPLICATION') || U.includes('M_SYSTEM_REPLICATION_SITES')) {
    const role = info.role ?? 'master'
    if (role === 'slave') {
      const masterHost = info.master_host ?? ''
      const lagSec = Number(info.master_last_io_seconds_ago ?? 0)
      return [{ SITE_ID: 1, SITE_NAME: masterHost, HOST: conn.host, PORT: conn.port, VOLUME_ID: 1, REPLICATION_MODE: 'ASYNC', REPLICATION_STATUS: info.master_link_status === 'up' ? 'Active' : 'Error', REPLICATION_STATUS_DETAILS: info.master_link_status ?? '', SECONDARY_HOST: masterHost, SECONDARY_PORT: Number(info.master_port ?? 6379), SECONDARY_FULLY_SYNCED: 'TRUE', SHIPPED_LOG_MB: 0, REPLICATED_LOG_MB: 0, ASYNC_BUFFER_FULL_COUNT: 0, REPLICATION_DELAY_MS: lagSec * 1000 }]
    }
    return []
  }
  if (U.includes('M_BACKUP_CATALOG')) return [{ ENTRY_ID: 1, BACKUP_TYPE: 'RDB snapshot', STATE: info.rdb_last_bgsave_status === 'ok' ? 'successful' : 'failed', STARTED: new Date(Number(info.rdb_last_save_time ?? 0) * 1000).toISOString(), FINISHED: new Date(Number(info.rdb_last_save_time ?? 0) * 1000).toISOString(), BACKUP_SIZE: Number(info.rdb_last_cow_size ?? 0), HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'redis-server', BACKUP_ID: 1, DATABASE_NAME: '0', SYSTEM_ID: conn.id }]

  return []
}
