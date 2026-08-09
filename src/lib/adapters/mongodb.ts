/**
 * MongoDB adapter — translates M_* patterns to serverStatus / currentOp / admin commands.
 */
import { MongoClient } from 'mongodb'
import type { ErpConnection } from '../connection-store'
import { decryptPassword } from '../connection-store'

type Row = Record<string, unknown>

const clients = new Map<string, MongoClient>()

async function getClient(conn: ErpConnection): Promise<MongoClient> {
  const existing = clients.get(conn.id)
  if (existing) return existing
  const pwd = decryptPassword(conn.passwordEnc)
  const auth = conn.username && pwd ? `${encodeURIComponent(conn.username)}:${encodeURIComponent(pwd)}@` : ''
  const uri = `mongodb://${auth}${conn.host}:${conn.port || 27017}/?connectTimeoutMS=5000&serverSelectionTimeoutMS=5000&authSource=${conn.database || 'admin'}`
  const client = new MongoClient(uri)
  await client.connect()
  clients.set(conn.id, client)
  return client
}

export async function queryMongoDB(conn: ErpConnection, sql: string): Promise<Row[]> {
  const client = await getClient(conn)
  const admin = client.db('admin')
  const U = sql.replace(/\s+/g, ' ').toUpperCase()

  const status = await admin.command({ serverStatus: 1 }) as Record<string, unknown>
  const mem   = (status.mem   ?? {}) as Record<string, number>
  const connections = (status.connections ?? {}) as Record<string, number>
  const opcounters  = (status.opcounters  ?? {}) as Record<string, number>
  const version     = String(status.version ?? 'unknown')
  const uptime      = Number(status.uptime ?? 0)

  const usedMemMb  = Number(mem.resident ?? 0)
  const virtualMb  = Number(mem.virtual  ?? 0)
  const limitMb    = virtualMb > 0 ? virtualMb : usedMemMb * 2
  const usedMemGb  = +(usedMemMb / 1024).toFixed(3)
  const limitGb    = +(limitMb   / 1024).toFixed(3)
  const freeGb     = +(limitGb - usedMemGb).toFixed(3)

  const totalConn   = connections.current ?? 0
  const availConn   = connections.available ?? 0
  const totalOps    = (opcounters.insert ?? 0) + (opcounters.query ?? 0) + (opcounters.update ?? 0) + (opcounters.delete ?? 0)

  // ── M_DATABASE ──────────────────────────────────────────────────────────────
  if (U.includes('M_DATABASE') && !U.includes('M_DATABASES')) {
    return [{ SYSTEM_ID: 'MongoDB', VERSION: version, USAGE: 'PRODUCTION', ACTIVE_STATUS: 'YES', HOST: conn.host, SVC: 1 }]
  }

  // ── M_HOST_RESOURCE_UTILIZATION ──────────────────────────────────────────────
  if (U.includes('M_HOST_RESOURCE_UTILIZATION')) {
    if (U.includes('IDLE_CPU_PCT')) {
      const cpuPct = Math.min(94, +((totalConn / Math.max(1, availConn + totalConn)) * 100 * 2).toFixed(1))
      return [{ HOST: conn.host, CPU_USED_PCT: cpuPct, OPEN_FILE_COUNT: totalConn, SWAP_MB: 0 }]
    }
    return [{ HOST: conn.host, LIMIT_GB: limitGb, USED_GB: usedMemGb, FREE_GB: freeGb, PHYS_USED_GB: usedMemGb, MEM_USED_GB: usedMemGb, MEM_FREE_GB: freeGb, MEM_LIMIT_GB: limitGb, ERP_USED_GB: usedMemGb }]
  }

  // ── M_CONNECTIONS ────────────────────────────────────────────────────────────
  if (U.includes('M_CONNECTIONS')) {
    return [{ TOTAL_CONN: totalConn, RUNNING: 1, IDLE: Math.max(0, totalConn - 1) }]
  }

  // ── M_SERVICES ──────────────────────────────────────────────────────────────
  if (U.includes('M_SERVICES') && U.includes('COUNT(*)')) {
    return [{ SVC_COUNT: 1, ACTIVE_COUNT: totalConn }]
  }
  if (U.includes('M_SERVICES')) {
    return [{ SERVICE_NAME: 'mongod', HOST: conn.host, PORT: conn.port, ACTIVE_STATUS: 'YES', SQL_EXECUTION_COUNT: totalOps, MEM_USED_MB: usedMemMb, CPU_SEC: uptime, CONNECTION_COUNT: totalConn, TRANSACTION_COUNT: 0, START_TIME: new Date(Date.now() - uptime * 1000).toISOString(), COORDINATOR_TYPE: 'COORDINATOR' }]
  }

  // ── M_SQL_PLAN_CACHE (current ops) ────────────────────────────────────────────
  if (U.includes('M_SQL_PLAN_CACHE') || U.includes('M_EXPENSIVE_STATEMENTS')) {
    try {
      const currentOp = await admin.command({ currentOp: 1, active: true, secs_running: { $gt: 5 } })
      const inprog = (currentOp.inprog ?? []) as Array<Record<string, unknown>>
      return inprog.slice(0, 20).map((op, i) => ({
        STATEMENT_HASH: String(op.opid ?? i),
        STATEMENT_STRING: JSON.stringify(op.command ?? {}).slice(0, 500),
        AVG_EXECUTION_TIME: Number(op.microsecs_running ?? 0),
        TOTAL_EXECUTION_TIME: Number(op.microsecs_running ?? 0),
        MAX_EXECUTION_TIME: Number(op.microsecs_running ?? 0),
        EXECUTION_COUNT: 1,
        TOTAL_RESULT_RECORD_COUNT: 0,
        USER_NAME: String((op.effectiveUsers as Array<{user?: string}>)?.[0]?.user ?? ''),
      }))
    } catch { return [] }
  }

  // ── M_CS_TABLES (collections as proxy) ───────────────────────────────────────
  if (U.includes('M_CS_TABLES')) {
    const databases = await admin.command({ listDatabases: 1 }) as { databases: Array<{ name: string; sizeOnDisk?: number }> }
    const tables: Row[] = []
    for (const db of (databases.databases ?? []).slice(0, 5)) {
      if (['admin', 'local', 'config'].includes(db.name)) continue
      const dbObj = client.db(db.name)
      const collections = await dbObj.listCollections().toArray()
      for (const col of collections.slice(0, 10)) {
        const stats = await dbObj.command({ collStats: col.name }).catch(() => ({})) as Record<string, unknown>
        const sizeGb = +(Number(stats.storageSize ?? 0) / 1073741824).toFixed(4)
        tables.push({ SCHEMA_NAME: db.name, TABLE_NAME: col.name, ROW_COUNT: stats.count ?? 0, MEMORY_SIZE_IN_TOTAL: sizeGb, MEMORY_SIZE_IN_MAIN: sizeGb, MEMORY_SIZE_IN_DELTA: 0, WRITE_COUNT: 0, READ_COUNT: 0 })
      }
    }
    if (U.includes('GROUP BY HOST')) {
      const total = tables.reduce((s, x) => s + Number(x.MEMORY_SIZE_IN_TOTAL), 0)
      return [{ HOST: conn.host, CS_TOTAL_GB: +total.toFixed(3), CS_DELTA_GB: 0, CS_MAIN_GB: +total.toFixed(3), CS_TABLE_COUNT: tables.length }]
    }
    return tables
  }

  // ── M_CS_UNLOADS ─────────────────────────────────────────────────────────────
  if (U.includes('M_CS_UNLOADS')) { return [] }

  // ── M_ALERTS ─────────────────────────────────────────────────────────────────
  if (U.includes('M_ALERTS') && !U.includes('M_ALERT_DEFINITIONS')) {
    const alerts: Row[] = []
    try {
      const currentOp = await admin.command({ currentOp: 1, active: true, secs_running: { $gt: 30 } })
      const inprog = (currentOp.inprog ?? []) as Array<Record<string, unknown>>
      inprog.slice(0, 10).forEach((op, i) => {
        alerts.push({ ALERT_ID: 100 + i, ALERT_TIMESTAMP: new Date().toISOString(), ALERT_RATING: Number(op.secs_running ?? 0) > 300 ? 5 : 3, ALERT_DETAILS: `Long op: ${JSON.stringify(op.command ?? {}).slice(0, 80)}`, ALERT_USERACTION: 'Review and kill if needed', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'mongod' })
      })
    } catch { /* ignore */ }
    const connPct = (totalConn / Math.max(1, totalConn + availConn)) * 100
    if (connPct > 85) alerts.push({ ALERT_ID: 1, ALERT_TIMESTAMP: new Date().toISOString(), ALERT_RATING: 4, ALERT_DETAILS: `Connection usage at ${connPct.toFixed(1)}%`, ALERT_USERACTION: 'Scale connection pool or add replica', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'mongod' })
    return alerts
  }

  if (U.includes('M_ALERT_DEFINITIONS')) {
    return [
      { ALERT_ID: 1, ALERT_NAME: 'Long Operations', ALERT_DESCRIPTION: 'Ops running >30s', ALERT_CATEGORY: 'PERFORMANCE', DEFAULT_THRESHOLD_WARNING_VALUE: 30, DEFAULT_THRESHOLD_CRITICAL_VALUE: 300, UNIT: 'seconds' },
      { ALERT_ID: 2, ALERT_NAME: 'Connection Pressure', ALERT_DESCRIPTION: 'Connections near limit', ALERT_CATEGORY: 'AVAILABILITY', DEFAULT_THRESHOLD_WARNING_VALUE: 80, DEFAULT_THRESHOLD_CRITICAL_VALUE: 95, UNIT: 'pct' },
    ]
  }

  // ── SYS_DATABASES / M_DATABASES ───────────────────────────────────────────────
  if (U.includes('SYS_DATABASES') || U.includes('M_DATABASES')) {
    const databases = await admin.command({ listDatabases: 1 }) as { databases: Array<{ name: string }> }
    return (databases.databases ?? []).map(db => ({ DATABASE_NAME: db.name, DESCRIPTION: db.name, ACTIVE_STATUS: 'YES', HOST: conn.host, SQL_PORT: conn.port, INDEXSERVER_ACTUAL_ROLE: 'MASTER', CURRENT_STATEMENT_COUNT: 0, START_TIME: new Date(Date.now() - uptime * 1000).toISOString(), STATUS: 'YES', DETAIL: '' }))
  }

  // Stubs
  if (U.includes('FROM USERS') || U.includes('USER_NAME')) return [{ USER_NAME: conn.username, USER_STATUS: 'ACTIVE', LAST_SUCCESSFUL_CONNECT: null, LAST_INVALID_CONNECT_ATTEMPT: null, INVALID_CONNECT_ATTEMPTS: 0, PASSWORD_CHANGE_TIME: null, PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'FALSE', IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'FALSE', CREATOR: 'SYSTEM', CREATE_TIME: null }]
  if (U.includes('FROM ROLES') || U.includes('ROLE_NAME')) return []
  if (U.includes('GRANTED_PRIVILEGES') || U.includes('GRANTED_ROLES')) return []
  if (U.includes('AUDIT_POLICIES')) return []
  if (U.includes('M_SERVICE_REPLICATION') || U.includes('M_SYSTEM_REPLICATION_SITES')) return []
  if (U.includes('M_BACKUP_CATALOG')) return []
  if (U.includes('M_HEAP_MEMORY')) return [{ HOST: conn.host, HEAP_USED_GB: usedMemGb, HEAP_ALLOC_GB: limitGb }]
  if (U.includes('M_SHARED_MEMORY')) return [{ HOST: conn.host, SHARED_GB: 0 }]
  if (U.includes('M_DISK_USAGE') || U.includes('M_VOLUMES') || U.includes('M_DISK_VOLUME_STATISTICS')) {
    const dbs = await admin.command({ listDatabases: 1 }) as { databases: Array<{ name: string; sizeOnDisk: number }> }
    const usedGb = (dbs.databases ?? []).reduce((s, d) => s + d.sizeOnDisk / 1073741824, 0)
    return [{ HOST: conn.host, USAGE_TYPE: 'DATA', PATH: '/var/lib/mongodb', TOTAL_GB: +(usedGb*2).toFixed(2), USED_GB: +usedGb.toFixed(2), FREE_GB: +usedGb.toFixed(2), USED_PCT: 50 }]
  }
  if (U.includes('M_VOLUME_IO_TOTAL_STATISTICS')) {
    const extra = (status.extra_info ?? {}) as Record<string, number>
    return [{ HOST: conn.host, READ_MB: +(extra.page_faults ?? 0).toFixed(1), WRITE_MB: 0, READ_OPS: opcounters.query ?? 0, WRITE_OPS: (opcounters.insert ?? 0) + (opcounters.update ?? 0) + (opcounters.delete ?? 0) }]
  }

  return []
}
