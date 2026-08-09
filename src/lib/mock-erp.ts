/**
 * VynSAP Mock ERP Engine
 *
 * Returns realistic SAP ERP M_* / SYS view data when no real connection is
 * configured (demo mode).  Query routing is done by keyword-matching the SQL
 * string — the same approach used by real SAP ERP monitoring views.
 *
 * Auto-activates when connections.json is empty; silently deactivates the
 * moment the first real connection is added.
 */

type Row = Record<string, unknown>

const HOST = 'erp-node-01'

// Relative timestamp helpers
const AGO = (hours: number) =>
  new Date(Date.now() - Math.round(hours * 3_600_000)).toISOString()

const ERP_VERSION = '2.00.070.00 (hdbindexserver 2.00.070.00.1712066413)'

// Snapshot values — consistent across all queries so cards add up correctly
const S = {
  memLimitGB:  64.0,
  memUsedGB:   38.42,   // physical used
  memFreeGB:   25.58,
  erpUsedGB:  35.17,   // ERP allocation
  heapUsedGB:  8.24,
  heapAllocGB: 10.48,
  sharedGB:    2.14,
  csGB:        22.41,
  csDeltaGB:   1.82,
  csMainGB:    20.59,
  cpuPct:      64.3,
  dataVolUsedGB: 40.3,
  dataVolTotalGB: 100.0,
  logVolUsedGB: 30.1,
  logVolTotalGB: 50.0,
}

// ─────────────────────────────────────────────────────────
//  Main dispatch function
// ─────────────────────────────────────────────────────────

export function mockQuery(sql: string): Row[] {
  const U = sql.replace(/\s+/g, ' ').toUpperCase()

  // ── M_DATABASE ──────────────────────────────────────────
  if (U.includes('M_DATABASE') && !U.includes('M_DATABASES')) {
    return [{
      SYSTEM_ID: 'HDB', VERSION: ERP_VERSION,
      USAGE: 'PRODUCTION', ACTIVE_STATUS: 'YES', HOST,
      SVC: 4,
    }]
  }

  // ── M_HOST_RESOURCE_UTILIZATION (3 distinct call shapes) ─
  if (U.includes('M_HOST_RESOURCE_UTILIZATION')) {
    if (U.includes('IDLE_CPU_PCT')) {
      // performance/route.ts CPU block
      return [{ HOST, CPU_USED_PCT: S.cpuPct, OPEN_FILE_COUNT: 1847, SWAP_MB: 0 }]
    }
    if (U.includes('TOTAL_MEMORY_USED_SIZE')) {
      // performance/route.ts memory block
      return [{
        HOST, MEM_USED_GB: S.memUsedGB, MEM_FREE_GB: S.memFreeGB,
        MEM_LIMIT_GB: S.memLimitGB, ERP_USED_GB: S.erpUsedGB,
      }]
    }
    if (U.includes('LIMIT_GB')) {
      // memory/route.ts + autonomous/route.ts
      return [{
        HOST, LIMIT_GB: S.memLimitGB, USED_GB: S.erpUsedGB,
        FREE_GB: S.memFreeGB, PHYS_USED_GB: S.memUsedGB,
      }]
    }
    // overview/route.ts (simple 3-column version)
    return [{ MEM_USED_GB: S.memUsedGB, MEM_FREE_GB: S.memFreeGB, MEM_LIMIT_GB: S.memLimitGB }]
  }

  // ── M_SERVICES (aggregate vs full list) ─────────────────
  if (U.includes('M_SERVICES') && U.includes('COUNT(*)')) {
    return [{ SVC_COUNT: 4, ACTIVE_COUNT: 4 }]
  }
  if (U.includes('M_SERVICES')) {
    return [
      { connId: 'erp-demo', SERVICE_NAME: 'nameserver',    HOST, PORT: 30001, ACTIVE_STATUS: 'YES', SQL_EXECUTION_COUNT: 12847,  MEM_USED_MB:  1240, CPU_SEC:   98340, CONNECTION_COUNT:   8, TRANSACTION_COUNT:  3, START_TIME: AGO(144), COORDINATOR_TYPE: 'COORDINATOR' },
      { connId: 'erp-demo', SERVICE_NAME: 'indexserver',   HOST, PORT: 30003, ACTIVE_STATUS: 'YES', SQL_EXECUTION_COUNT: 489203, MEM_USED_MB: 28420, CPU_SEC: 1204870, CONNECTION_COUNT: 142, TRANSACTION_COUNT: 18, START_TIME: AGO(144), COORDINATOR_TYPE: 'NONE' },
      { connId: 'erp-demo', SERVICE_NAME: 'preprocessor',  HOST, PORT: 30010, ACTIVE_STATUS: 'YES', SQL_EXECUTION_COUNT:  3421,  MEM_USED_MB:   892, CPU_SEC:   28430, CONNECTION_COUNT:   4, TRANSACTION_COUNT:  0, START_TIME: AGO(144), COORDINATOR_TYPE: 'NONE' },
      { connId: 'erp-demo', SERVICE_NAME: 'compileserver', HOST, PORT: 30010, ACTIVE_STATUS: 'YES', SQL_EXECUTION_COUNT:  8204,  MEM_USED_MB:   312, CPU_SEC:   43210, CONNECTION_COUNT:   2, TRANSACTION_COUNT:  1, START_TIME: AGO(144), COORDINATOR_TYPE: 'NONE' },
    ]
  }

  // ── M_CONNECTIONS ────────────────────────────────────────
  if (U.includes('M_CONNECTIONS')) {
    return [{ TOTAL_CONN: 156, RUNNING: 12, IDLE: 144 }]
  }

  // ── M_VOLUME_IO_TOTAL_STATISTICS ─────────────────────────
  if (U.includes('M_VOLUME_IO_TOTAL_STATISTICS')) {
    return [{ HOST, READ_MB: 894230, WRITE_MB: 421087, READ_OPS: 7284930, WRITE_OPS: 3120847 }]
  }

  // ── M_ALERT_DEFINITIONS ──────────────────────────────────
  if (U.includes('M_ALERT_DEFINITIONS')) {
    return [
      { ALERT_ID:  1, ALERT_NAME: 'CPU Usage',                ALERT_DESCRIPTION: 'High CPU utilization',           ALERT_CATEGORY: 'Performance', DEFAULT_THRESHOLD_WARNING_VALUE: '80',   DEFAULT_THRESHOLD_CRITICAL_VALUE: '95',  UNIT: '%'     },
      { ALERT_ID:  2, ALERT_NAME: 'Backup Age',               ALERT_DESCRIPTION: 'No recent data backup',          ALERT_CATEGORY: 'Backup',      DEFAULT_THRESHOLD_WARNING_VALUE: '24',   DEFAULT_THRESHOLD_CRITICAL_VALUE: '48',  UNIT: 'hours' },
      { ALERT_ID:  3, ALERT_NAME: 'Memory Usage',             ALERT_DESCRIPTION: 'ERP memory limit reached',      ALERT_CATEGORY: 'Memory',      DEFAULT_THRESHOLD_WARNING_VALUE: '85',   DEFAULT_THRESHOLD_CRITICAL_VALUE: '95',  UNIT: '%'     },
      { ALERT_ID:  5, ALERT_NAME: 'Table Fragmentation',      ALERT_DESCRIPTION: 'Column store fragmentation',     ALERT_CATEGORY: 'Column Store',DEFAULT_THRESHOLD_WARNING_VALUE: '20',   DEFAULT_THRESHOLD_CRITICAL_VALUE: '40',  UNIT: '%'     },
      { ALERT_ID: 18, ALERT_NAME: 'Uncommitted Transactions', ALERT_DESCRIPTION: 'High uncommitted write txns',    ALERT_CATEGORY: 'Transaction', DEFAULT_THRESHOLD_WARNING_VALUE: '1000', DEFAULT_THRESHOLD_CRITICAL_VALUE: '2000',UNIT: 'count' },
      { ALERT_ID: 22, ALERT_NAME: 'Disk Usage',               ALERT_DESCRIPTION: 'Data volume disk usage high',   ALERT_CATEGORY: 'Disk',        DEFAULT_THRESHOLD_WARNING_VALUE: '75',   DEFAULT_THRESHOLD_CRITICAL_VALUE: '90',  UNIT: '%'     },
    ]
  }

  // ── M_ALERTS ─────────────────────────────────────────────
  if (U.includes('M_ALERTS')) {
    return [
      { ALERT_ID:  2, ALERT_TIMESTAMP: AGO(2),  ALERT_RATING: 3, HOST, PORT: 30003, SERVICE_NAME: 'indexserver',
        ALERT_DETAILS:    'Last data backup is older than 24 hours. Most recent backup started ' + AGO(26),
        ALERT_USERACTION: 'Perform a complete data backup as soon as possible.' },
      { ALERT_ID:  5, ALERT_TIMESTAMP: AGO(8),  ALERT_RATING: 3, HOST, PORT: 30003, SERVICE_NAME: 'indexserver',
        ALERT_DETAILS:    'Table fragmentation detected in SAPMANDT.BALDAT — 28.4% fragmented after last delta merge.',
        ALERT_USERACTION: 'Consider running a manual delta merge: MERGE DELTA OF "SAPMANDT"."BALDAT"' },
      { ALERT_ID: 18, ALERT_TIMESTAMP: AGO(14), ALERT_RATING: 2, HOST, PORT: 30003, SERVICE_NAME: 'indexserver',
        ALERT_DETAILS:    'Number of uncommitted write transactions is elevated (threshold: 1000, current: 1148).',
        ALERT_USERACTION: 'Review long-running transactions in M_TRANSACTIONS and investigate blocking.' },
    ]
  }

  // ── M_SQL_PLAN_CACHE_OVERVIEW ────────────────────────────
  if (U.includes('M_SQL_PLAN_CACHE_OVERVIEW')) {
    return [{ SCHEMA_NAME: 'SAPMANDT', PLAN_CACHE_HITS: 2847230, PLAN_CACHE_MISSES: 14823, CACHE_SIZE_MB: 512.4, PLAN_CACHE_CAPACITY: 2048, PLAN_CACHE_EVICTIONS: 3214 }]
  }

  // ── M_SQL_PLAN_CACHE (aggregate stats) ───────────────────
  if (U.includes('M_SQL_PLAN_CACHE') && U.includes('TOTAL_CPU_MIN')) {
    return [{ TOTAL_CPU_MIN: 847.3, TOTAL_EXECUTIONS: 3421847, UNIQUE_STATEMENTS: 4823, UNIQUE_USERS: 18 }]
  }

  // ── M_SQL_PLAN_CACHE (expensive queries list) ────────────
  if (U.includes('M_SQL_PLAN_CACHE')) {
    return [
      { STATEMENT_HASH: 'a1b2c3d4e5f6', SQL_TEXT: "SELECT MATNR, MAKTX FROM MARA INNER JOIN MAKT ON MARA.MATNR = MAKT.MATNR WHERE MARA.MTART IN (SELECT MTART FROM T134 WHERE SPRAS = 'EN')", EXECUTION_COUNT: 42830, TOTAL_SEC: 1284.3, AVG_SEC: 0.030, MAX_SEC: 4.821, CURSOR_SEC: 1102.4, TOTAL_LOCK_WAIT_COUNT: 0, TOTAL_RESULT_RECORD_COUNT: 892347,  SCHEMA_NAME: 'SAPMANDT',  USER_NAME: 'SAPR3',   OPERATION: 'SELECT', LAST_EXECUTION_TIMESTAMP: AGO(0.08) },
      { STATEMENT_HASH: 'b2c3d4e5f6a1', SQL_TEXT: 'UPDATE BSEG SET AUGDT = ?, AUGBL = ? WHERE BUKRS = ? AND BELNR = ? AND GJAHR = ? AND BUZEI = ?',                                        EXECUTION_COUNT: 12847, TOTAL_SEC:  948.2, AVG_SEC: 0.074, MAX_SEC: 12.40, CURSOR_SEC:  820.3, TOTAL_LOCK_WAIT_COUNT: 23, TOTAL_RESULT_RECORD_COUNT:  12847,  SCHEMA_NAME: 'SAPMANDT',  USER_NAME: 'SAPR3',   OPERATION: 'UPDATE', LAST_EXECUTION_TIMESTAMP: AGO(0.30) },
      { STATEMENT_HASH: 'c3d4e5f6a1b2', SQL_TEXT: "SELECT VBELN, POSNR, MATNR, KWMENG FROM VBAP WHERE VBELN IN (SELECT VBELN FROM VBAK WHERE AUART = ? AND ERDAT >= ?)",                  EXECUTION_COUNT:  8420, TOTAL_SEC:  724.1, AVG_SEC: 0.086, MAX_SEC:  8.20, CURSOR_SEC:  680.4, TOTAL_LOCK_WAIT_COUNT:  0, TOTAL_RESULT_RECORD_COUNT: 284120,  SCHEMA_NAME: 'SAPMANDT',  USER_NAME: 'SAPR3',   OPERATION: 'SELECT', LAST_EXECUTION_TIMESTAMP: AGO(0.50) },
      { STATEMENT_HASH: 'd4e5f6a1b2c3', SQL_TEXT: 'CALL "SAPMANDT"."GENERATE_FINANCIAL_REPORT"(IN_PERIOD => ?, IN_BUKRS => ?, OUT_RESULT => ?)',                                             EXECUTION_COUNT:    12, TOTAL_SEC:  584.2, AVG_SEC: 48.68, MAX_SEC: 124.3, CURSOR_SEC:  584.2, TOTAL_LOCK_WAIT_COUNT:  0, TOTAL_RESULT_RECORD_COUNT:      0,  SCHEMA_NAME: 'SAPMANDT',  USER_NAME: 'FIAPP',   OPERATION: 'CALL',   LAST_EXECUTION_TIMESTAMP: AGO(6.00) },
      { STATEMENT_HASH: 'e5f6a1b2c3d4', SQL_TEXT: 'SELECT COUNT(*) FROM BKPF WHERE BUDAT BETWEEN ? AND ? AND BUKRS = ?',                                                                    EXECUTION_COUNT: 284020, TOTAL_SEC: 482.7, AVG_SEC: 0.002, MAX_SEC:  0.84, CURSOR_SEC:  420.1, TOTAL_LOCK_WAIT_COUNT:  0, TOTAL_RESULT_RECORD_COUNT: 284020,  SCHEMA_NAME: 'SAPMANDT',  USER_NAME: 'SAPR3',   OPERATION: 'SELECT', LAST_EXECUTION_TIMESTAMP: AGO(0.01) },
      { STATEMENT_HASH: 'f6a1b2c3d4e5', SQL_TEXT: "SELECT LIFNR, NAME1, ORT01 FROM LFA1 WHERE LIFNR LIKE ? ORDER BY NAME1",                                                                 EXECUTION_COUNT:   3824, TOTAL_SEC:  287.4, AVG_SEC: 0.075, MAX_SEC:  3.21, CURSOR_SEC:  240.8, TOTAL_LOCK_WAIT_COUNT:  0, TOTAL_RESULT_RECORD_COUNT: 194820,  SCHEMA_NAME: 'SAPMANDT',  USER_NAME: 'MMUSER',  OPERATION: 'SELECT', LAST_EXECUTION_TIMESTAMP: AGO(1.20) },
    ]
  }

  // ── M_CS_TABLES — memory/route.ts summary ────────────────
  if (U.includes('M_CS_TABLES') && U.includes('CS_TOTAL_GB')) {
    return [{ HOST, CS_TOTAL_GB: S.csGB, CS_DELTA_GB: S.csDeltaGB, CS_MAIN_GB: S.csMainGB, CS_TABLE_COUNT: 1247 }]
  }

  // ── M_CS_TABLES — column-store aggregate summary ─────────
  if (U.includes('M_CS_TABLES') && U.includes('FULLY_LOADED')) {
    return [{ TOTAL_GB: S.csGB, MAIN_GB: S.csMainGB, DELTA_GB: S.csDeltaGB, TABLE_COUNT: 1247, TOTAL_ROWS: 148_204_820, FULLY_LOADED: 1218, UNLOADED_COUNT: 29 }]
  }

  // ── M_CS_TABLES — column-store topDelta list ─────────────
  if (U.includes('M_CS_TABLES') && U.includes('LAST_MERGE_TIME')) {
    return [
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'BSEG',     DELTA_ROWS: 84201,  LAST_MERGE_TIME: AGO(1),  MERGE_COUNT: 2341 },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'BKPF',     DELTA_ROWS: 12847,  LAST_MERGE_TIME: AGO(2),  MERGE_COUNT:  847 },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'VBAP',     DELTA_ROWS: 31240,  LAST_MERGE_TIME: AGO(3),  MERGE_COUNT: 1247 },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'LIKP',     DELTA_ROWS:  8420,  LAST_MERGE_TIME: AGO(4),  MERGE_COUNT:  312 },
      { SCHEMA_NAME: 'SAPDEMO',  TABLE_NAME: 'DEMO_ORDERS', DELTA_ROWS: 1240, LAST_MERGE_TIME: AGO(6), MERGE_COUNT:   42 },
    ]
  }

  // ── M_CS_TABLES — full table list ────────────────────────
  if (U.includes('M_CS_TABLES')) {
    return [
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'BSEG',        HOST, TOTAL_MB: 18420, MAIN_MB: 17840, DELTA_MB:  842, ROW_COUNT: 84201847, DELTA_ROWS: 84201, COMPRESSED_ROWS: 84117646, IS_COLUMN_LOADABLE: 'TRUE', LOADED: 'FULL' },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'BKPF',        HOST, TOTAL_MB:  4284, MAIN_MB:  4156, DELTA_MB:  128, ROW_COUNT: 18420847, DELTA_ROWS: 12847, COMPRESSED_ROWS: 18408000, IS_COLUMN_LOADABLE: 'TRUE', LOADED: 'FULL' },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'VBAP',        HOST, TOTAL_MB:  9841, MAIN_MB:  9529, DELTA_MB:  312, ROW_COUNT: 42841020, DELTA_ROWS: 31240, COMPRESSED_ROWS: 42809780, IS_COLUMN_LOADABLE: 'TRUE', LOADED: 'FULL' },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'VBAK',        HOST, TOTAL_MB:  2841, MAIN_MB:  2780, DELTA_MB:   61, ROW_COUNT: 12840200, DELTA_ROWS:  8420, COMPRESSED_ROWS: 12831780, IS_COLUMN_LOADABLE: 'TRUE', LOADED: 'FULL' },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'MARA',        HOST, TOTAL_MB:  1248, MAIN_MB:  1248, DELTA_MB:    0, ROW_COUNT:  4820100, DELTA_ROWS:     0, COMPRESSED_ROWS:  4820100, IS_COLUMN_LOADABLE: 'TRUE', LOADED: 'FULL' },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'BALDAT',      HOST, TOTAL_MB:  1284, MAIN_MB:  1284, DELTA_MB:    0, ROW_COUNT:  2841020, DELTA_ROWS:     0, COMPRESSED_ROWS:  2841020, IS_COLUMN_LOADABLE: 'TRUE', LOADED: 'NO'   },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'INDX',        HOST, TOTAL_MB:   841, MAIN_MB:   841, DELTA_MB:    0, ROW_COUNT:  1284100, DELTA_ROWS:     0, COMPRESSED_ROWS:  1284100, IS_COLUMN_LOADABLE: 'TRUE', LOADED: 'NO'   },
      { SCHEMA_NAME: 'SAPDEMO',  TABLE_NAME: 'DEMO_ORDERS', HOST, TOTAL_MB:   284, MAIN_MB:   272, DELTA_MB:   12, ROW_COUNT:  1204820, DELTA_ROWS:  1240, COMPRESSED_ROWS:  1203580, IS_COLUMN_LOADABLE: 'TRUE', LOADED: 'FULL' },
    ]
  }

  // ── M_CS_UNLOADS ─────────────────────────────────────────
  if (U.includes('M_CS_UNLOADS')) {
    return [
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'BALDAT',      UNLOAD_COUNT: 47, LAST_UNLOAD: AGO(1) },
      { SCHEMA_NAME: 'SAPMANDT', TABLE_NAME: 'INDX',        UNLOAD_COUNT: 23, LAST_UNLOAD: AGO(3) },
      { SCHEMA_NAME: 'SAPDEMO',  TABLE_NAME: 'DEMO_ORDERS', UNLOAD_COUNT: 12, LAST_UNLOAD: AGO(6) },
    ]
  }

  // ── M_HEAP_MEMORY ─────────────────────────────────────────
  if (U.includes('M_HEAP_MEMORY')) {
    return [{ HOST, HEAP_USED_GB: S.heapUsedGB, HEAP_ALLOC_GB: S.heapAllocGB }]
  }

  // ── M_SHARED_MEMORY ──────────────────────────────────────
  if (U.includes('M_SHARED_MEMORY')) {
    return [{ HOST, SHARED_GB: S.sharedGB }]
  }

  // ── M_BACKUP_CATALOG_FILES ───────────────────────────────
  if (U.includes('M_BACKUP_CATALOG_FILES')) {
    return [
      { ENTRY_ID: 1001, DESTINATION_TYPE_NAME: 'FILE', PATH: '/erp/backup/data/FULL_20260724_0200', BACKUP_SIZE: 42_947_122_176, MESSAGE: 'Backup completed successfully', SOURCE_ID: 1 },
      { ENTRY_ID: 1000, DESTINATION_TYPE_NAME: 'FILE', PATH: '/erp/backup/log/LOG_20260724_0600',  BACKUP_SIZE:  2_147_483_648, MESSAGE: 'Log backup completed',          SOURCE_ID: 1 },
    ]
  }

  // ── M_BACKUP_CATALOG ──────────────────────────────────────
  if (U.includes('M_BACKUP_CATALOG')) {
    return [
      { ENTRY_ID: 1001, ENTRY_TYPE_NAME: 'complete data backup', BACKUP_ID: 1721779200, SYS_START_TIME: AGO(4),   SYS_END_TIME: AGO(3.5),  STATE_NAME: 'successful', DESTINATION_TYPE_NAME: 'FILE', BACKUP_SIZE: 42_947_122_176, SIZE_GB: 40.0, COMMENT: 'Scheduled full backup',  SOURCE_ID: 1 },
      { ENTRY_ID: 1000, ENTRY_TYPE_NAME: 'log backup',           BACKUP_ID: 1721765700, SYS_START_TIME: AGO(8),   SYS_END_TIME: AGO(7.8),  STATE_NAME: 'successful', DESTINATION_TYPE_NAME: 'FILE', BACKUP_SIZE:  2_147_483_648, SIZE_GB:  2.0, COMMENT: '',                    SOURCE_ID: 1 },
      { ENTRY_ID:  999, ENTRY_TYPE_NAME: 'complete data backup', BACKUP_ID: 1721692800, SYS_START_TIME: AGO(28),  SYS_END_TIME: AGO(27.4), STATE_NAME: 'successful', DESTINATION_TYPE_NAME: 'FILE', BACKUP_SIZE: 41_943_040_000, SIZE_GB: 39.1, COMMENT: 'Scheduled full backup',  SOURCE_ID: 1 },
      { ENTRY_ID:  998, ENTRY_TYPE_NAME: 'log backup',           BACKUP_ID: 1721678300, SYS_START_TIME: AGO(32),  SYS_END_TIME: AGO(31.8), STATE_NAME: 'successful', DESTINATION_TYPE_NAME: 'FILE', BACKUP_SIZE:  1_932_735_283, SIZE_GB:  1.8, COMMENT: '',                    SOURCE_ID: 1 },
      { ENTRY_ID:  997, ENTRY_TYPE_NAME: 'complete data backup', BACKUP_ID: 1721606400, SYS_START_TIME: AGO(52),  SYS_END_TIME: AGO(51.4), STATE_NAME: 'successful', DESTINATION_TYPE_NAME: 'FILE', BACKUP_SIZE: 40_802_189_312, SIZE_GB: 38.0, COMMENT: 'Scheduled full backup',  SOURCE_ID: 1 },
    ]
  }

  // ── M_VOLUMES ─────────────────────────────────────────────
  if (U.includes('M_VOLUMES')) {
    return [
      { VOLUME_ID: 1, SERVICE_NAME: 'indexserver', HOST, PORT: 30003, VOLUME_TYPE: 'DATA', MAX_SIZE: 107_374_182_400, USED_SIZE: 43_219_435_520, PATH: '/erp/data/HDB/mnt00001/hdb00003', MAX_GB: S.dataVolTotalGB, USED_GB: S.dataVolUsedGB },
      { VOLUME_ID: 2, SERVICE_NAME: 'indexserver', HOST, PORT: 30003, VOLUME_TYPE: 'LOG',  MAX_SIZE:  53_687_091_200, USED_SIZE: 32_212_254_720, PATH: '/erp/log/HDB/mnt00001/hdb00003',  MAX_GB: S.logVolTotalGB,  USED_GB: S.logVolUsedGB  },
    ]
  }

  // ── M_DISK_USAGE ──────────────────────────────────────────
  if (U.includes('M_DISK_USAGE')) {
    return [
      { HOST, USAGE_TYPE: 'DATA',        PATH: '/erp/data',   TOTAL_GB: S.dataVolTotalGB, USED_GB: S.dataVolUsedGB, FREE_GB: S.dataVolTotalGB - S.dataVolUsedGB, USED_PCT: 40.3 },
      { HOST, USAGE_TYPE: 'LOG',         PATH: '/erp/log',    TOTAL_GB: S.logVolTotalGB,  USED_GB: S.logVolUsedGB,  FREE_GB: S.logVolTotalGB  - S.logVolUsedGB,  USED_PCT: 60.2 },
      { HOST, USAGE_TYPE: 'DATA_BACKUP', PATH: '/erp/backup', TOTAL_GB: 200.0,            USED_GB: 85.4,            FREE_GB: 114.6,                               USED_PCT: 42.7 },
    ]
  }

  // ── M_DISK_VOLUME_STATISTICS ─────────────────────────────
  if (U.includes('M_DISK_VOLUME_STATISTICS')) {
    return [{ HOST, DATA_VOL_TOTAL_GB: S.dataVolTotalGB, DATA_VOL_USED_GB: S.dataVolUsedGB, LOG_VOL_TOTAL_GB: S.logVolTotalGB, LOG_VOL_USED_GB: S.logVolUsedGB }]
  }

  // ── M_SYSTEM_REPLICATION_SITES ───────────────────────────
  if (U.includes('M_SYSTEM_REPLICATION_SITES')) {
    return [
      { SITE_ID: 1, SITE_NAME: 'SITE1', REPLICATION_MODE: 'PRIMARY', FAILOVER_STATUS: 'N/A', FAILOVER_TIME: null, OPERATION_MODE: 'PRIMARY'   },
      { SITE_ID: 2, SITE_NAME: 'SITE2', REPLICATION_MODE: 'SYNC',    FAILOVER_STATUS: 'N/A', FAILOVER_TIME: null, OPERATION_MODE: 'LOGREPLAY' },
    ]
  }

  // ── M_SERVICE_REPLICATION ────────────────────────────────
  if (U.includes('M_SERVICE_REPLICATION')) {
    return [{
      SITE_ID: 1, SITE_NAME: 'SITE1', HOST, PORT: 30003, VOLUME_ID: 1,
      REPLICATION_MODE: 'SYNC', REPLICATION_STATUS: 'ACTIVE',
      REPLICATION_STATUS_DETAILS: 'Normal replication — fully synced',
      SECONDARY_HOST: 'erp-node-02', SECONDARY_PORT: 30003,
      SECONDARY_FULLY_SYNCED: 'TRUE',
      SHIPPED_LOG_MB: 1024.5, REPLICATED_LOG_MB: 1024.5,
      ASYNC_BUFFER_FULL_COUNT: 0, REPLICATION_DELAY_MS: 2,
      SHIPPED_MB: 1024.5, REPLICATED_MB: 1024.5,
      SHIPPED_SAVEPOINT_ID: 847230, REPLICATED_SAVEPOINT_ID: 847228,
    }]
  }

  // ── SYS_DATABASES ────────────────────────────────────────
  if (U.includes('SYS_DATABASES')) {
    return [
      { DATABASE_NAME: 'SYSTEMDB', DESCRIPTION: 'System Database',       ACTIVE_STATUS: 'YES', HOST, SQL_PORT: 30013, INDEXSERVER_ACTUAL_ROLE: 'MASTER', CURRENT_STATEMENT_COUNT:  3, START_TIME: AGO(144) },
      { DATABASE_NAME: 'SAPMANDT', DESCRIPTION: 'SAP Production Tenant', ACTIVE_STATUS: 'YES', HOST, SQL_PORT: 30015, INDEXSERVER_ACTUAL_ROLE: 'MASTER', CURRENT_STATEMENT_COUNT: 18, START_TIME: AGO(144) },
      { DATABASE_NAME: 'SAPDEMO',  DESCRIPTION: 'SAP Demo Tenant',       ACTIVE_STATUS: 'YES', HOST, SQL_PORT: 30017, INDEXSERVER_ACTUAL_ROLE: 'MASTER', CURRENT_STATEMENT_COUNT:  2, START_TIME: AGO(144) },
    ]
  }

  // ── M_DATABASES ──────────────────────────────────────────
  if (U.includes('M_DATABASES')) {
    return [
      { DATABASE_NAME: 'SYSTEMDB', STATUS: 'RUNNING', DETAIL: '' },
      { DATABASE_NAME: 'SAPMANDT', STATUS: 'RUNNING', DETAIL: '' },
      { DATABASE_NAME: 'SAPDEMO',  STATUS: 'RUNNING', DETAIL: '' },
    ]
  }

  // ── SCHEMAS ───────────────────────────────────────────────
  if (U.includes('FROM SCHEMAS')) {
    return [
      { SCHEMA_NAME: 'SAPMANDT',  OWNER_NAME: 'SAPR3',     HAS_PRIVILEGES: 'TRUE' },
      { SCHEMA_NAME: 'SAPDEMO',   OWNER_NAME: 'SAPUSER',   HAS_PRIVILEGES: 'TRUE' },
      { SCHEMA_NAME: 'SAPREPORT', OWNER_NAME: 'SAPREPORT', HAS_PRIVILEGES: 'TRUE' },
    ]
  }

  // ── TABLES (schema explorer) ──────────────────────────────
  if (U.includes('FROM TABLES')) {
    return [
      { SCHEMA_NAME: 'SAPMANDT',  TABLE_NAME: 'BKPF',        TABLE_TYPE: 'COLUMN', COLUMN_COUNT:  42, COMMENT: 'Accounting Document Header',   CREATE_TIME: AGO(8760), IS_COLUMN_TABLE: 'TRUE',  IS_TEMPORARY: 'FALSE' },
      { SCHEMA_NAME: 'SAPMANDT',  TABLE_NAME: 'BSEG',        TABLE_TYPE: 'COLUMN', COLUMN_COUNT: 186, COMMENT: 'Accounting Document Segment',  CREATE_TIME: AGO(8760), IS_COLUMN_TABLE: 'TRUE',  IS_TEMPORARY: 'FALSE' },
      { SCHEMA_NAME: 'SAPMANDT',  TABLE_NAME: 'MARA',        TABLE_TYPE: 'COLUMN', COLUMN_COUNT: 182, COMMENT: 'General Material Data',        CREATE_TIME: AGO(8760), IS_COLUMN_TABLE: 'TRUE',  IS_TEMPORARY: 'FALSE' },
      { SCHEMA_NAME: 'SAPMANDT',  TABLE_NAME: 'VBAK',        TABLE_TYPE: 'COLUMN', COLUMN_COUNT:  87, COMMENT: 'Sales Document: Header Data',  CREATE_TIME: AGO(8760), IS_COLUMN_TABLE: 'TRUE',  IS_TEMPORARY: 'FALSE' },
      { SCHEMA_NAME: 'SAPMANDT',  TABLE_NAME: 'VBAP',        TABLE_TYPE: 'COLUMN', COLUMN_COUNT: 128, COMMENT: 'Sales Document: Item Data',    CREATE_TIME: AGO(8760), IS_COLUMN_TABLE: 'TRUE',  IS_TEMPORARY: 'FALSE' },
      { SCHEMA_NAME: 'SAPMANDT',  TABLE_NAME: 'LFA1',        TABLE_TYPE: 'COLUMN', COLUMN_COUNT:  73, COMMENT: 'Vendor Master (General Data)', CREATE_TIME: AGO(8760), IS_COLUMN_TABLE: 'TRUE',  IS_TEMPORARY: 'FALSE' },
      { SCHEMA_NAME: 'SAPDEMO',   TABLE_NAME: 'DEMO_ORDERS', TABLE_TYPE: 'COLUMN', COLUMN_COUNT:  24, COMMENT: 'Demo Orders Table',           CREATE_TIME: AGO(720),  IS_COLUMN_TABLE: 'TRUE',  IS_TEMPORARY: 'FALSE' },
      { SCHEMA_NAME: 'SAPREPORT', TABLE_NAME: 'REPORT_CACHE',TABLE_TYPE: 'ROW',    COLUMN_COUNT:  12, COMMENT: 'Report results cache',         CREATE_TIME: AGO(2160), IS_COLUMN_TABLE: 'FALSE', IS_TEMPORARY: 'FALSE' },
    ]
  }

  // ── VIEWS ─────────────────────────────────────────────────
  if (U.includes('FROM VIEWS')) {
    return [
      { SCHEMA_NAME: 'SAPMANDT',  VIEW_NAME: 'V_OPEN_ITEMS',        VIEW_TYPE: 'CALC', COMMENT: 'Open FI items view',     CREATE_TIME: AGO(4320) },
      { SCHEMA_NAME: 'SAPMANDT',  VIEW_NAME: 'V_SALES_SUMMARY',     VIEW_TYPE: 'SQL',  COMMENT: 'Sales order summary',   CREATE_TIME: AGO(2160) },
      { SCHEMA_NAME: 'SAPDEMO',   VIEW_NAME: 'V_DEMO_ORDER_DETAIL', VIEW_TYPE: 'SQL',  COMMENT: 'Order detail view',     CREATE_TIME: AGO(720)  },
    ]
  }

  // ── PROCEDURES ────────────────────────────────────────────
  if (U.includes('FROM PROCEDURES')) {
    return [
      { SCHEMA_NAME: 'SAPMANDT', PROCEDURE_NAME: 'GENERATE_FINANCIAL_REPORT', INPUT_PARAMETER_COUNT: 2, OUTPUT_PARAMETER_COUNT: 1, INOUT_PARAMETER_COUNT: 0, CREATE_TIME: AGO(4320), DEFINITION: 'PROCEDURE "SAPMANDT"."GENERATE_FINANCIAL_REPORT"(IN IN_PERIOD NVARCHAR(6), IN IN_BUKRS NVARCHAR(4), OUT OUT_RESULT TABLE(...)) ...' },
      { SCHEMA_NAME: 'SAPMANDT', PROCEDURE_NAME: 'DELTA_MERGE_TABLES',       INPUT_PARAMETER_COUNT: 1, OUTPUT_PARAMETER_COUNT: 0, INOUT_PARAMETER_COUNT: 0, CREATE_TIME: AGO(8760), DEFINITION: 'PROCEDURE "SAPMANDT"."DELTA_MERGE_TABLES"(IN SCHEMA_NAME NVARCHAR(256)) ...' },
      { SCHEMA_NAME: 'SAPDEMO',  PROCEDURE_NAME: 'DEMO_LOAD_ORDERS',         INPUT_PARAMETER_COUNT: 0, OUTPUT_PARAMETER_COUNT: 1, INOUT_PARAMETER_COUNT: 0, CREATE_TIME: AGO(720),  DEFINITION: 'PROCEDURE "SAPDEMO"."DEMO_LOAD_ORDERS"(OUT ROW_COUNT INTEGER) ...' },
    ]
  }

  // ── FUNCTIONS ─────────────────────────────────────────────
  if (U.includes('FROM FUNCTIONS')) {
    return [
      { SCHEMA_NAME: 'SAPMANDT', FUNCTION_NAME: 'GET_PERIOD_END',    FUNCTION_TYPE: 'SCALAR', INPUT_PARAMETER_COUNT: 2, CREATE_TIME: AGO(2160) },
      { SCHEMA_NAME: 'SAPDEMO',  FUNCTION_NAME: 'DEMO_CALC_TOTAL',   FUNCTION_TYPE: 'SCALAR', INPUT_PARAMETER_COUNT: 1, CREATE_TIME: AGO(720)  },
    ]
  }

  // ── USERS ─────────────────────────────────────────────────
  if (U.includes('FROM USERS')) {
    return [
      { USER_NAME: 'SYSTEM',  USER_STATUS: 'ACTIVE',   LAST_SUCCESSFUL_CONNECT: AGO(0.5),   LAST_INVALID_CONNECT_ATTEMPT: null, INVALID_CONNECT_ATTEMPTS: 0, PASSWORD_CHANGE_TIME: AGO(8760),  PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'FALSE', IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'TRUE', CREATOR: 'SYSTEM', CREATE_TIME: AGO(17520) },
      { USER_NAME: 'SAPR3',   USER_STATUS: 'ACTIVE',   LAST_SUCCESSFUL_CONNECT: AGO(0.1),   LAST_INVALID_CONNECT_ATTEMPT: null, INVALID_CONNECT_ATTEMPTS: 0, PASSWORD_CHANGE_TIME: AGO(4320),  PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'FALSE', IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'TRUE', CREATOR: 'SYSTEM', CREATE_TIME: AGO(8760)  },
      { USER_NAME: 'FIAPP',   USER_STATUS: 'ACTIVE',   LAST_SUCCESSFUL_CONNECT: AGO(2),     LAST_INVALID_CONNECT_ATTEMPT: null, INVALID_CONNECT_ATTEMPTS: 0, PASSWORD_CHANGE_TIME: AGO(2160),  PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'FALSE', IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'TRUE', CREATOR: 'SYSTEM', CREATE_TIME: AGO(4320)  },
      { USER_NAME: 'MMUSER',  USER_STATUS: 'ACTIVE',   LAST_SUCCESSFUL_CONNECT: AGO(1.2),   LAST_INVALID_CONNECT_ATTEMPT: null, INVALID_CONNECT_ATTEMPTS: 0, PASSWORD_CHANGE_TIME: AGO(1080),  PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'FALSE', IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'TRUE', CREATOR: 'SYSTEM', CREATE_TIME: AGO(4320)  },
      { USER_NAME: 'MONUSER', USER_STATUS: 'ACTIVE',   LAST_SUCCESSFUL_CONNECT: AGO(0),     LAST_INVALID_CONNECT_ATTEMPT: null, INVALID_CONNECT_ATTEMPTS: 0, PASSWORD_CHANGE_TIME: AGO(720),   PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'TRUE',  IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'TRUE', CREATOR: 'SYSTEM', CREATE_TIME: AGO(2160)  },
      { USER_NAME: 'SAPUSER', USER_STATUS: 'INACTIVE', LAST_SUCCESSFUL_CONNECT: AGO(8760),  LAST_INVALID_CONNECT_ATTEMPT: AGO(720), INVALID_CONNECT_ATTEMPTS: 3, PASSWORD_CHANGE_TIME: AGO(17520), PASSWORD_POLICY: 'DEFAULT', IS_RESTRICTED: 'FALSE', IS_PASSWORD_LIFETIME_CHECK_ENABLED: 'TRUE', CREATOR: 'SYSTEM', CREATE_TIME: AGO(17520) },
    ]
  }

  // ── ROLES ─────────────────────────────────────────────────
  if (U.includes('FROM ROLES')) {
    return [
      { ROLE_NAME: 'CONTENT_ADMIN',    ROLE_MODE: 'GLOBAL', IS_ENABLED: 'TRUE', COMMENT: 'Content administration role',        CREATE_TIME: AGO(17520) },
      { ROLE_NAME: 'MONITORING',       ROLE_MODE: 'GLOBAL', IS_ENABLED: 'TRUE', COMMENT: 'Read-only monitoring access',        CREATE_TIME: AGO(17520) },
      { ROLE_NAME: 'SAP_ERP_ADMIN',   ROLE_MODE: 'GLOBAL', IS_ENABLED: 'TRUE', COMMENT: 'Full SAP ERP admin privileges',     CREATE_TIME: AGO(17520) },
      { ROLE_NAME: 'SAP_ERP_MODELING',ROLE_MODE: 'GLOBAL', IS_ENABLED: 'TRUE', COMMENT: 'Modeling workspace access',          CREATE_TIME: AGO(17520) },
      { ROLE_NAME: 'SAPR3_ROLE',       ROLE_MODE: 'GLOBAL', IS_ENABLED: 'TRUE', COMMENT: 'SAP application role',              CREATE_TIME: AGO(8760)  },
    ]
  }

  // ── GRANTED_PRIVILEGES ───────────────────────────────────
  if (U.includes('GRANTED_PRIVILEGES')) {
    return [
      { GRANTEE: 'SAPR3',   GRANTEE_TYPE: 'USER', GRANTOR: 'SYSTEM', PRIVILEGE: 'SELECT', OBJECT_TYPE: 'TABLE',  SCHEMA_NAME: 'SAPMANDT', OBJECT_NAME: 'BKPF', IS_VALID: 'TRUE', IS_GRANTABLE: 'FALSE' },
      { GRANTEE: 'MONUSER', GRANTEE_TYPE: 'USER', GRANTOR: 'SYSTEM', PRIVILEGE: 'SELECT', OBJECT_TYPE: 'SCHEMA', SCHEMA_NAME: 'SYS',      OBJECT_NAME: '',     IS_VALID: 'TRUE', IS_GRANTABLE: 'FALSE' },
    ]
  }

  // ── AUDIT_POLICIES ───────────────────────────────────────
  if (U.includes('AUDIT_POLICIES')) {
    return [
      { POLICY_NAME: 'DEFAULT_AUDIT_POLICY',   STATUS: 'ACTIVE', AUDIT_LEVEL: 'ERROR', EVENT_STATUS: 'ERROR', TRAIL_TYPE: 'SYSLOGPROTOCOL', RETENTION_DAY:  90, CREATE_TIME: AGO(8760) },
      { POLICY_NAME: 'PRIVILEGED_USER_ACCESS', STATUS: 'ACTIVE', AUDIT_LEVEL: 'INFO',  EVENT_STATUS: 'ALL',   TRAIL_TYPE: 'TABLE',          RETENTION_DAY: 365, CREATE_TIME: AGO(4320) },
    ]
  }

  // ── GRANTED_ROLES ────────────────────────────────────────
  if (U.includes('GRANTED_ROLES')) {
    return [
      { GRANTEE: 'SAPR3',   ROLE_NAME: 'SAPR3_ROLE', GRANTOR: 'SYSTEM', IS_GRANTABLE: 'FALSE' },
      { GRANTEE: 'MONUSER', ROLE_NAME: 'MONITORING',  GRANTOR: 'SYSTEM', IS_GRANTABLE: 'FALSE' },
    ]
  }

  // Fallback — return empty array; the UI already handles empty states
  return []
}
