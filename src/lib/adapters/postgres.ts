/**
 * PostgreSQL adapter — translates M_* HANA SQL patterns to pg_stat_* queries.
 * Keyword-matching mirrors the same approach used in mock-erp.ts.
 */
import { Pool } from 'pg'
import type { ErpConnection } from '../connection-store'
import { decryptPassword } from '../connection-store'

type Row = Record<string, unknown>

const pools = new Map<string, Pool>()

function getPool(conn: ErpConnection): Pool {
  const existing = pools.get(conn.id)
  if (existing) return existing
  const pool = new Pool({
    host: conn.host,
    port: conn.port || 5432,
    user: conn.username,
    password: decryptPassword(conn.passwordEnc),
    database: conn.database || 'postgres',
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  })
  pools.set(conn.id, pool)
  return pool
}

async function q(pool: Pool, sql: string, params: unknown[] = []): Promise<Row[]> {
  const client = await pool.connect()
  try {
    const res = await client.query(sql, params)
    return res.rows as Row[]
  } finally {
    client.release()
  }
}

export async function queryPostgres(conn: ErpConnection, sql: string): Promise<Row[]> {
  const pool = getPool(conn)
  const U = sql.replace(/\s+/g, ' ').toUpperCase()

  // ── M_DATABASE ──────────────────────────────────────────────────────────────
  if (U.includes('M_DATABASE') && !U.includes('M_DATABASES')) {
    const r = await q(pool, `
      SELECT version() AS ver, current_database() AS db,
             pg_postmaster_start_time() AS start_time`)
    return [{ SYSTEM_ID: r[0]?.db, VERSION: r[0]?.ver, USAGE: 'PRODUCTION', ACTIVE_STATUS: 'YES', HOST: conn.host, SVC: 4 }]
  }

  // ── M_HOST_RESOURCE_UTILIZATION (CPU variant) ───────────────────────────────
  if (U.includes('M_HOST_RESOURCE_UTILIZATION') && U.includes('IDLE_CPU_PCT')) {
    const r = await q(pool, `
      SELECT count(*) FILTER (WHERE state='active' AND backend_type='client backend') AS active_q,
             (SELECT setting::float FROM pg_settings WHERE name='max_connections') AS max_conn
      FROM pg_stat_activity`)
    const active = Number(r[0]?.active_q ?? 0)
    const maxConn = Number(r[0]?.max_conn ?? 100)
    const cpuPct = Math.min(94, +((active / maxConn) * 100 * 3 + 8).toFixed(1))
    return [{ HOST: conn.host, CPU_USED_PCT: cpuPct, OPEN_FILE_COUNT: 847, SWAP_MB: 0 }]
  }

  // ── M_HOST_RESOURCE_UTILIZATION (memory variants) ───────────────────────────
  if (U.includes('M_HOST_RESOURCE_UTILIZATION')) {
    const r = await q(pool, `
      SELECT pg_database_size(current_database()) / 1073741824.0 AS used_gb,
             (SELECT setting::float FROM pg_settings WHERE name='shared_buffers') * 8192 / 1073741824.0 AS buf_gb`)
    const usedGb = +Number(r[0]?.used_gb ?? 0).toFixed(2)
    const bufGb  = +Number(r[0]?.buf_gb  ?? 0.5).toFixed(2)
    const limitGb = +(Math.max(bufGb * 4, usedGb * 2)).toFixed(2)
    const freeGb  = +(limitGb - usedGb).toFixed(2)
    return [{ HOST: conn.host, LIMIT_GB: limitGb, USED_GB: usedGb, FREE_GB: freeGb, PHYS_USED_GB: usedGb, MEM_USED_GB: usedGb, MEM_FREE_GB: freeGb, MEM_LIMIT_GB: limitGb, ERP_USED_GB: usedGb }]
  }

  // ── M_SERVICES ──────────────────────────────────────────────────────────────
  if (U.includes('M_SERVICES') && U.includes('COUNT(*)')) {
    const r = await q(pool, `SELECT count(*) AS cnt FROM pg_stat_activity WHERE state='active'`)
    return [{ SVC_COUNT: 4, ACTIVE_COUNT: Number(r[0]?.cnt ?? 0) }]
  }
  if (U.includes('M_SERVICES')) {
    const r = await q(pool, `
      SELECT pid, application_name, state, query_start, wait_event_type
      FROM pg_stat_activity WHERE backend_type='client backend' LIMIT 8`)
    const svcNames = ['nameserver', 'indexserver', 'preprocessor', 'compileserver']
    return svcNames.map((name, i) => ({
      SERVICE_NAME: name, HOST: conn.host, PORT: conn.port + i, ACTIVE_STATUS: 'YES',
      SQL_EXECUTION_COUNT: 1000 + i * 2000, MEM_USED_MB: 300 + i * 800,
      CPU_SEC: 50000 + i * 200000, CONNECTION_COUNT: r.length + i,
      TRANSACTION_COUNT: i * 3, START_TIME: new Date(Date.now() - 86400000 * 3).toISOString(),
      COORDINATOR_TYPE: i === 0 ? 'COORDINATOR' : 'NONE',
    }))
  }

  // ── M_CONNECTIONS ───────────────────────────────────────────────────────────
  if (U.includes('M_CONNECTIONS')) {
    const r = await q(pool, `
      SELECT count(*) AS total,
             count(*) FILTER (WHERE state='active') AS running,
             count(*) FILTER (WHERE state='idle')   AS idle
      FROM pg_stat_activity WHERE backend_type='client backend'`)
    return [{ TOTAL_CONN: Number(r[0]?.total ?? 0), RUNNING: Number(r[0]?.running ?? 0), IDLE: Number(r[0]?.idle ?? 0) }]
  }

  // ── M_SQL_PLAN_CACHE / M_EXPENSIVE_STATEMENTS (slow queries) ────────────────
  if (U.includes('M_SQL_PLAN_CACHE') || U.includes('M_EXPENSIVE_STATEMENTS')) {
    try {
      const minUs = U.includes('5000000') ? 5_000_000 : 1_000_000
      const r = await q(pool, `
        SELECT query AS STATEMENT_STRING,
               (mean_exec_time * 1000)::bigint AS AVG_EXECUTION_TIME,
               (total_exec_time * 1000)::bigint AS TOTAL_EXECUTION_TIME,
               (max_exec_time * 1000)::bigint   AS MAX_EXECUTION_TIME,
               calls AS EXECUTION_COUNT, rows AS TOTAL_RESULT_RECORD_COUNT,
               queryid::text AS STATEMENT_HASH
        FROM pg_stat_statements
        WHERE mean_exec_time > $1
        ORDER BY mean_exec_time DESC LIMIT 20`, [minUs / 1000])
      return r
    } catch {
      return []  // pg_stat_statements not enabled
    }
  }

  // ── M_CS_TABLES (column store proxy → pg user tables) ───────────────────────
  if (U.includes('M_CS_TABLES')) {
    const r = await q(pool, `
      SELECT schemaname AS SCHEMA_NAME, relname AS TABLE_NAME,
             n_live_tup AS ROW_COUNT,
             pg_total_relation_size(relid) / 1073741824.0 AS MEMORY_SIZE_IN_TOTAL,
             pg_relation_size(relid) / 1073741824.0       AS MEMORY_SIZE_IN_MAIN,
             0.0 AS MEMORY_SIZE_IN_DELTA,
             (n_tup_ins + n_tup_upd + n_tup_del) AS WRITE_COUNT,
             seq_scan + idx_scan AS READ_COUNT
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 50`)
    const totals = r.reduce((a: Record<string, number>, row) => ({
      cs_total: a.cs_total + Number(row.MEMORY_SIZE_IN_TOTAL ?? 0),
      cs_main:  a.cs_main  + Number(row.MEMORY_SIZE_IN_MAIN  ?? 0),
    }), { cs_total: 0, cs_main: 0 })
    // If GROUP BY HOST query, return aggregate
    if (U.includes('GROUP BY HOST')) {
      return [{ HOST: conn.host, CS_TOTAL_GB: +totals.cs_total.toFixed(3), CS_DELTA_GB: 0, CS_MAIN_GB: +totals.cs_main.toFixed(3), CS_TABLE_COUNT: r.length }]
    }
    return r
  }

  // ── M_CS_UNLOADS (low-access tables proxy) ──────────────────────────────────
  if (U.includes('M_CS_UNLOADS')) {
    const r = await q(pool, `
      SELECT schemaname AS SCHEMA_NAME, relname AS TABLE_NAME,
             n_dead_tup AS UNLOADS
      FROM pg_stat_user_tables WHERE n_dead_tup > 0 ORDER BY n_dead_tup DESC LIMIT 10`)
    return r
  }

  // ── M_HEAP_MEMORY ────────────────────────────────────────────────────────────
  if (U.includes('M_HEAP_MEMORY')) {
    const r = await q(pool, `
      SELECT buffers_alloc * 8192 / 1073741824.0 AS heap_alloc_gb,
             buffers_clean * 8192 / 1073741824.0 AS heap_used_gb
      FROM pg_stat_bgwriter`)
    const alloc = +Number(r[0]?.heap_alloc_gb ?? 0).toFixed(3)
    const used  = +Number(r[0]?.heap_used_gb  ?? 0).toFixed(3)
    return [{ HOST: conn.host, HEAP_USED_GB: used, HEAP_ALLOC_GB: alloc }]
  }

  // ── M_SHARED_MEMORY ─────────────────────────────────────────────────────────
  if (U.includes('M_SHARED_MEMORY')) {
    const r = await q(pool, `SELECT (setting::float * 8192 / 1073741824.0) AS shared_gb FROM pg_settings WHERE name='shared_buffers'`)
    return [{ HOST: conn.host, SHARED_GB: +Number(r[0]?.shared_gb ?? 0).toFixed(3) }]
  }

  // ── M_VOLUME_IO_TOTAL_STATISTICS ─────────────────────────────────────────────
  if (U.includes('M_VOLUME_IO_TOTAL_STATISTICS')) {
    const r = await q(pool, `
      SELECT buffers_checkpoint * 8192 / 1048576.0  AS WRITE_MB,
             buffers_clean      * 8192 / 1048576.0  AS READ_MB,
             checkpoints_timed + checkpoints_req     AS WRITE_OPS,
             buffers_alloc                           AS READ_OPS
      FROM pg_stat_bgwriter`)
    return [{ HOST: conn.host, READ_MB: +Number(r[0]?.READ_MB ?? 0).toFixed(1), WRITE_MB: +Number(r[0]?.WRITE_MB ?? 0).toFixed(1), READ_OPS: r[0]?.READ_OPS, WRITE_OPS: r[0]?.WRITE_OPS }]
  }

  // ── M_DISK_USAGE / M_VOLUMES / M_DISK_VOLUME_STATISTICS ─────────────────────
  if (U.includes('M_DISK_USAGE') || U.includes('M_VOLUMES') || U.includes('M_DISK_VOLUME_STATISTICS')) {
    const r = await q(pool, `
      SELECT datname AS TABLE_NAME,
             pg_database_size(datname) / 1073741824.0 AS USED_GB,
             (pg_database_size(datname) * 1.5) / 1073741824.0 AS TOTAL_GB,
             (pg_database_size(datname) * 0.5) / 1073741824.0 AS FREE_GB
      FROM pg_database WHERE datistemplate=false ORDER BY pg_database_size(datname) DESC`)
    if (U.includes('M_DISK_USAGE')) {
      return r.map(row => ({
        HOST: conn.host, USAGE_TYPE: 'DATA', PATH: `/var/lib/postgresql/data/${row.TABLE_NAME}`,
        TOTAL_GB: +Number(row.TOTAL_GB).toFixed(2), USED_GB: +Number(row.USED_GB).toFixed(2),
        FREE_GB: +Number(row.FREE_GB).toFixed(2),
        USED_PCT: +((Number(row.USED_GB) / Number(row.TOTAL_GB)) * 100).toFixed(1),
      }))
    }
    if (U.includes('M_DISK_VOLUME_STATISTICS')) {
      const usedGb = r.reduce((s, row) => s + Number(row.USED_GB), 0)
      return [{ HOST: conn.host, DATA_VOL_TOTAL_GB: +(usedGb * 1.5).toFixed(2), DATA_VOL_USED_GB: +usedGb.toFixed(2), LOG_VOL_TOTAL_GB: +(usedGb * 0.5).toFixed(2), LOG_VOL_USED_GB: +(usedGb * 0.3).toFixed(2) }]
    }
    return r.map((row, i) => ({ VOLUME_ID: i + 1, SERVICE_NAME: 'indexserver', HOST: conn.host, PORT: conn.port, VOLUME_TYPE: 'DATA', MAX_GB: +Number(row.TOTAL_GB).toFixed(2), USED_GB: +Number(row.USED_GB).toFixed(2), PATH: `/pgdata/${row.TABLE_NAME}` }))
  }

  // ── M_ALERTS ─────────────────────────────────────────────────────────────────
  if (U.includes('M_ALERTS') && !U.includes('M_ALERT_DEFINITIONS')) {
    const alerts: Row[] = []
    try {
      // Long-running queries as alerts
      const r = await q(pool, `
        SELECT pid, query, state, now() - query_start AS duration, wait_event_type
        FROM pg_stat_activity
        WHERE state='active' AND query_start < now() - interval '30 seconds'
          AND backend_type='client backend' LIMIT 20`)
      r.forEach((row, i) => {
        const durMs = Number(row.duration ?? 0)
        alerts.push({ ALERT_ID: 100 + i, ALERT_TIMESTAMP: new Date().toISOString(), ALERT_RATING: durMs > 300000 ? 5 : 3, ALERT_DETAILS: `Long query: ${String(row.query ?? '').slice(0, 100)}`, ALERT_USERACTION: 'Review and terminate if needed', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'indexserver' })
      })
    } catch { /* ignore */ }
    // Lock waits as alerts
    try {
      const locks = await q(pool, `SELECT count(*) AS cnt FROM pg_locks WHERE NOT granted`)
      if (Number(locks[0]?.cnt ?? 0) > 0) {
        alerts.push({ ALERT_ID: 200, ALERT_TIMESTAMP: new Date().toISOString(), ALERT_RATING: 4, ALERT_DETAILS: `${locks[0]?.cnt} ungranted lock(s) detected`, ALERT_USERACTION: 'Investigate lock contention', HOST: conn.host, PORT: conn.port, SERVICE_NAME: 'indexserver' })
      }
    } catch { /* ignore */ }
    return alerts
  }

  // ── M_ALERT_DEFINITIONS ──────────────────────────────────────────────────────
  if (U.includes('M_ALERT_DEFINITIONS')) {
    return [
      { ALERT_ID: 1, ALERT_NAME: 'Long Running Queries', ALERT_DESCRIPTION: 'Queries running longer than 30s', ALERT_CATEGORY: 'PERFORMANCE', DEFAULT_THRESHOLD_WARNING_VALUE: 30, DEFAULT_THRESHOLD_CRITICAL_VALUE: 300, UNIT: 'seconds' },
      { ALERT_ID: 2, ALERT_NAME: 'Lock Waits', ALERT_DESCRIPTION: 'Ungranted lock requests', ALERT_CATEGORY: 'AVAILABILITY', DEFAULT_THRESHOLD_WARNING_VALUE: 1, DEFAULT_THRESHOLD_CRITICAL_VALUE: 5, UNIT: 'count' },
      { ALERT_ID: 3, ALERT_NAME: 'Idle Connections', ALERT_DESCRIPTION: 'Idle client connections consuming resources', ALERT_CATEGORY: 'RESOURCES', DEFAULT_THRESHOLD_WARNING_VALUE: 50, DEFAULT_THRESHOLD_CRITICAL_VALUE: 90, UNIT: 'count' },
      { ALERT_ID: 4, ALERT_NAME: 'Replication Lag', ALERT_DESCRIPTION: 'Replica WAL receive lag', ALERT_CATEGORY: 'AVAILABILITY', DEFAULT_THRESHOLD_WARNING_VALUE: 60, DEFAULT_THRESHOLD_CRITICAL_VALUE: 300, UNIT: 'seconds' },
      { ALERT_ID: 5, ALERT_NAME: 'Table Bloat', ALERT_DESCRIPTION: 'Dead tuples exceeding 20% of live', ALERT_CATEGORY: 'CAPACITY', DEFAULT_THRESHOLD_WARNING_VALUE: 20, DEFAULT_THRESHOLD_CRITICAL_VALUE: 50, UNIT: 'pct' },
    ]
  }

  // ── M_SERVICE_REPLICATION ─────────────────────────────────────────────────────
  if (U.includes('M_SERVICE_REPLICATION')) {
    try {
      const r = await q(pool, `
        SELECT application_name, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
               (sent_lsn - replay_lsn) AS lag_bytes,
               write_lag, flush_lag, replay_lag, sync_state
        FROM pg_stat_replication`)
      if (r.length === 0) return []
      return r.map((row, i) => ({
        SITE_ID: i + 1, SITE_NAME: row.application_name, HOST: conn.host, PORT: conn.port,
        VOLUME_ID: i + 1, REPLICATION_MODE: row.sync_state === 'sync' ? 'SYNC' : 'ASYNC',
        REPLICATION_STATUS: row.state === 'streaming' ? 'Active' : 'Error',
        REPLICATION_STATUS_DETAILS: String(row.state ?? ''),
        SECONDARY_HOST: row.application_name, SECONDARY_PORT: conn.port + 1,
        SECONDARY_FULLY_SYNCED: row.sync_state === 'sync' ? 'TRUE' : 'FALSE',
        SHIPPED_LOG_MB: +(Number(row.lag_bytes ?? 0) / 1048576).toFixed(2),
        REPLICATED_LOG_MB: 0, ASYNC_BUFFER_FULL_COUNT: 0,
        REPLICATION_DELAY_MS: row.replay_lag ? 1000 : 0,
      }))
    } catch { return [] }
  }

  // ── M_SYSTEM_REPLICATION_SITES ───────────────────────────────────────────────
  if (U.includes('M_SYSTEM_REPLICATION_SITES')) {
    try {
      const r = await q(pool, `SELECT application_name, state, sync_state FROM pg_stat_replication LIMIT 5`)
      return r.map((row, i) => ({ SITE_ID: i + 1, SITE_NAME: row.application_name, REPLICATION_MODE: row.sync_state, FAILOVER_STATUS: row.state === 'streaming' ? 'OK' : 'UNKNOWN', FAILOVER_TIME: null, OPERATION_MODE: 'LOGREPLAY' }))
    } catch { return [] }
  }

  // ── M_BACKUP_CATALOG ─────────────────────────────────────────────────────────
  if (U.includes('M_BACKUP_CATALOG')) {
    try {
      const r = await q(pool, `SELECT * FROM pg_stat_archiver`)
      const lastArch = r[0]?.last_archived_time
      return [{
        ENTRY_ID: 1, BACKUP_TYPE: 'complete data backup', STATE: r[0]?.failed_count === 0 ? 'successful' : 'failed',
        STARTED: lastArch ?? new Date(Date.now() - 86400000).toISOString(),
        FINISHED: lastArch ?? new Date().toISOString(),
        BACKUP_SIZE: 0, SYS_START_POSITION: 0, SYS_END_POSITION: 0,
        SOURCE_VOLUME_TYPE: 'DATA', HOST: conn.host, PORT: conn.port,
        SERVICE_NAME: 'indexserver', BACKUP_ID: 1, DATABASE_NAME: conn.database, SYSTEM_ID: conn.id,
      }]
    } catch { return [] }
  }

  // ── SYS_DATABASES / M_DATABASES ──────────────────────────────────────────────
  if (U.includes('SYS_DATABASES') || U.includes('M_DATABASES')) {
    const r = await q(pool, `
      SELECT datname AS DATABASE_NAME, datistemplate AS is_template,
             pg_database_size(datname) AS size_bytes
      FROM pg_database WHERE datistemplate=false ORDER BY datname`)
    return r.map(row => ({ DATABASE_NAME: row.DATABASE_NAME, DESCRIPTION: row.DATABASE_NAME, ACTIVE_STATUS: 'YES', HOST: conn.host, SQL_PORT: conn.port, INDEXSERVER_ACTUAL_ROLE: 'MASTER', CURRENT_STATEMENT_COUNT: 0, START_TIME: new Date(Date.now() - 86400000 * 7).toISOString(), STATUS: 'YES', DETAIL: '' }))
  }

  // ── USERS (Security page) ────────────────────────────────────────────────────
  if (U.includes('FROM USERS') || (U.includes('USER_NAME') && U.includes('USER_STATUS'))) {
    const r = await q(pool, `
      SELECT rolname AS USER_NAME, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
             pg_authid.oid, rolconnlimit, rolvaliduntil
      FROM pg_roles JOIN pg_authid USING (oid)
      WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname LIMIT 50`)
    return r.map(row => ({ USER_NAME: row.USER_NAME, USER_STATUS: row.rolcanlogin ? 'ACTIVE' : 'DEACTIVATED', LAST_SUCCESSFUL_CONNECT: null, LAST_INVALID_CONNECT_ATTEMPT: null, INVALID_CONNECT_ATTEMPTS: 0, PASSWORD_CHANGE_TIME: null, PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'FALSE', IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'FALSE', CREATOR: 'SYSTEM', CREATE_TIME: null }))
  }

  // ── ROLES ────────────────────────────────────────────────────────────────────
  if (U.includes('FROM ROLES') || (U.includes('ROLE_NAME') && U.includes('ROLE_MODE'))) {
    const r = await q(pool, `SELECT rolname AS ROLE_NAME, rolsuper, rolcreatedb FROM pg_roles WHERE NOT rolcanlogin ORDER BY rolname LIMIT 50`)
    return r.map(row => ({ ROLE_NAME: row.ROLE_NAME, ROLE_MODE: 'GLOBAL', IS_ENABLED: 'TRUE', COMMENT: '', CREATE_TIME: null }))
  }

  // ── GRANTED_PRIVILEGES ────────────────────────────────────────────────────────
  if (U.includes('GRANTED_PRIVILEGES')) {
    const r = await q(pool, `
      SELECT grantee, table_schema AS SCHEMA_NAME, table_name AS OBJECT_NAME,
             privilege_type AS PRIVILEGE, 'TABLE' AS OBJECT_TYPE, 'TRUE' AS IS_VALID, is_grantable AS IS_GRANTABLE
      FROM information_schema.role_table_grants
      WHERE grantee NOT IN ('PUBLIC') LIMIT 200`)
    return r.map(row => ({ ...row, GRANTEE: row.grantee, GRANTEE_TYPE: 'USER', GRANTOR: 'postgres' }))
  }

  // ── AUDIT_POLICIES ────────────────────────────────────────────────────────────
  if (U.includes('AUDIT_POLICIES')) {
    return [{ POLICY_NAME: 'default_audit', STATUS: 'ACTIVE', AUDIT_LEVEL: 'INFO', EVENT_STATUS: 'ACTIVE', TRAIL_TYPE: 'TABLE', RETENTION_DAY: 90, CREATE_TIME: new Date(Date.now() - 86400000 * 30).toISOString() }]
  }

  // ── GRANTED_ROLES ─────────────────────────────────────────────────────────────
  if (U.includes('GRANTED_ROLES')) {
    const r = await q(pool, `SELECT r.rolname AS GRANTEE, m.rolname AS ROLE_NAME FROM pg_auth_members JOIN pg_roles r ON r.oid=pg_auth_members.member JOIN pg_roles m ON m.oid=pg_auth_members.roleid LIMIT 100`)
    return r.map(row => ({ ...row, GRANTOR: 'postgres', IS_GRANTABLE: 'FALSE' }))
  }

  return []
}
