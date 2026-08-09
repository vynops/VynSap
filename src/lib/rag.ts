/**
 * Simple BM25-style RAG over a curated SAP/DB knowledge base.
 * Injects the top-k relevant chunks into every Copilot request.
 */
import fs from 'fs'
import path from 'path'
import { loadCopilotHistory } from './copilot-history-store'

export interface KnowledgeChunk {
  id: string
  title: string
  tags: string[]
  content: string
  source: string
}

// ─── Curated knowledge base ─────────────────────────────────────────────────
const BUILT_IN_CHUNKS: KnowledgeChunk[] = [
  { id: 'pg-vacuum', title: 'PostgreSQL VACUUM and Bloat', tags: ['postgres','vacuum','bloat','performance'], source: 'PG Docs', content: 'Run VACUUM ANALYZE regularly to reclaim dead tuples and update planner statistics. Use pg_stat_user_tables.n_dead_tup to identify bloated tables. For very bloated tables, VACUUM FULL (takes exclusive lock) reclaims space. autovacuum tuning: lower autovacuum_vacuum_scale_factor (0.01) for large hot tables. Check pg_stat_bgwriter for autovacuum activity.' },
  { id: 'pg-repl', title: 'PostgreSQL Streaming Replication', tags: ['postgres','replication','wal','standby','lag'], source: 'PG Docs', content: 'Monitor replication lag with: SELECT now() - pg_last_xact_replay_timestamp() on standby, or sent_lsn - replay_lsn on primary via pg_stat_replication. High lag causes: slow disk on standby, wal_receiver_timeout, network bottleneck. Tune wal_level=replica, max_wal_senders=10, wal_keep_size. Use synchronous_commit=off for write-heavy workloads.' },
  { id: 'pg-slow', title: 'PostgreSQL Slow Query Analysis', tags: ['postgres','slow','query','pg_stat_statements','explain'], source: 'PG Docs', content: 'Enable pg_stat_statements in postgresql.conf. Use SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20. Run EXPLAIN (ANALYZE, BUFFERS) on slow queries. Look for Seq Scan on large tables (add index), Hash Join with large memory spills (increase work_mem), or nested loops on large sets.' },
  { id: 'pg-idx', title: 'PostgreSQL Index Strategy', tags: ['postgres','index','btree','partial','covering'], source: 'PG Docs', content: 'Use pg_stat_user_indexes to find unused indexes (idx_scan=0). Create partial indexes for filtered queries: CREATE INDEX ON orders(status) WHERE status=\'pending\'. Covering indexes (INCLUDE) avoid heap fetches. For LIKE \'prefix%\', use text_pattern_ops. Monitor index bloat with pgstattuple extension. Avoid over-indexing — each index slows writes.' },
  { id: 'mysql-perf', title: 'MySQL InnoDB Performance Tuning', tags: ['mysql','innodb','buffer_pool','performance'], source: 'MySQL Docs', content: 'innodb_buffer_pool_size should be 70-80% of server RAM. Check buffer pool hit rate: (1 - Innodb_buffer_pool_reads/Innodb_buffer_pool_read_requests)*100 — target >99%. Use performance_schema.events_statements_summary_by_digest for slow query analysis. Set slow_query_log=ON, long_query_time=1. innodb_flush_log_at_trx_commit=2 improves throughput at slight durability cost.' },
  { id: 'mysql-repl', title: 'MySQL Replication Monitoring', tags: ['mysql','replication','seconds_behind','gtid'], source: 'MySQL Docs', content: 'Check Seconds_Behind_Source in SHOW REPLICA STATUS. Zero means in sync. High lag: slave is behind, check Replica_SQL_Running_State. Use GTID replication (gtid_mode=ON) for reliable failover. Monitor Replica_IO_Running and Replica_SQL_Running — both must be YES. Set slave_net_timeout=60 to detect network issues faster.' },
  { id: 'redis-mem', title: 'Redis Memory Management', tags: ['redis','memory','eviction','fragmentation','maxmemory'], source: 'Redis Docs', content: 'Set maxmemory with appropriate maxmemory-policy (allkeys-lru for cache). Monitor mem_fragmentation_ratio — >1.5 indicates fragmentation; run MEMORY PURGE or restart with active-defrag-enabled yes. Used_memory vs used_memory_rss gap = fragmentation. MEMORY DOCTOR gives recommendations. Use OBJECT ENCODING to check if data types use efficient internal representations.' },
  { id: 'redis-slow', title: 'Redis Slowlog Analysis', tags: ['redis','slowlog','latency','commands'], source: 'Redis Docs', content: 'Use SLOWLOG GET 25 to retrieve slow commands. slowlog-log-slower-than 10000 (microseconds). Common causes: O(N) commands on large sets (KEYS, SMEMBERS), blocking operations (BLPOP with no consumers), large value serialization. Use SCAN instead of KEYS in production. Monitor with LATENCY HISTORY event.' },
  { id: 'mongo-perf', title: 'MongoDB Query Performance', tags: ['mongodb','index','explain','aggregation','slow'], source: 'MongoDB Docs', content: 'Enable profiler: db.setProfilingLevel(1, {slowms: 100}). Review system.profile for slow queries. Use db.collection.explain("executionStats").find({...}) to check if queries use IXSCAN (good) or COLLSCAN (bad). Create compound indexes matching query patterns: {field1:1, field2:1} for queries filtering on both. Use $project to limit fields and reduce network transfer.' },
  { id: 'mongo-mem', title: 'MongoDB WiredTiger Memory', tags: ['mongodb','wiredtiger','cache','memory'], source: 'MongoDB Docs', content: 'WiredTiger cache is 50% of RAM by default (wiredTigerCacheSizeGB). Monitor via db.serverStatus().wiredTiger.cache. High "bytes currently in the cache" / "maximum bytes configured" ratio = memory pressure. Pages evicted by application threads means cache too small. tcmalloc stats show fragmentation. Restart periodically to defragment.' },
  { id: 'sap-delta-merge', title: 'SAP ERP Delta Merge Operations', tags: ['sap','erp','hana','column-store','delta','merge'], source: 'SAP Docs', content: 'Delta merge moves data from row-store delta segment to compressed column-store main storage. Monitor with M_CS_TABLES (MEMORY_SIZE_IN_DELTA). High delta ratio (>20%) degrades read performance. Trigger: MERGE DELTA OF schema.table. Delta merges run automatically (smart merge), but high-write tables may need manual scheduling before peak read windows (reports, month-end close).' },
  { id: 'sap-memory', title: 'SAP ERP Memory Architecture', tags: ['sap','erp','hana','memory','heap','column-store'], source: 'SAP Docs', content: 'ERP database memory = Column Store (main+delta) + Row Store + Code heap + Stack. M_HOST_RESOURCE_UTILIZATION shows ALLOCATION_LIMIT vs TOTAL_MEMORY_USED_SIZE. Column store dominates; loaded tables stay in memory. If nearing ALLOCATION_LIMIT, unload cold tables: ALTER TABLE schema.table UNLOAD. Increase GLOBAL_ALLOCATION_LIMIT parameter for more headroom. M_CS_UNLOADS tracks tables that were evicted.' },
  { id: 'sap-backup', title: 'SAP ERP Backup Strategy', tags: ['sap','erp','hana','backup','recovery','rpo','rto'], source: 'SAP Docs', content: 'ERP supports full, incremental, and differential backups. M_BACKUP_CATALOG shows all backup history. Full backup weekly + log backups every 15 min gives RPO <15 min. Log backup interval: backup_log_threshold parameter. Verify with BACKUP_CHECK_CONSISTENCY function. Store backups off-host. Recovery: recover database until timestamp/log position using RECOVER DATABASE statement.' },
  { id: 'incident-runbook', title: 'High CPU Incident Runbook', tags: ['incident','cpu','runbook','triage'], source: 'VynSAP Runbooks', content: 'CPU > 90%: 1) Check M_HOST_RESOURCE_UTILIZATION for CPU_USED_PCT by host. 2) Identify expensive queries: M_SQL_PLAN_CACHE ORDER BY AVG_EXECUTION_TIME DESC. 3) Check M_EXPENSIVE_STATEMENTS for current executions. 4) Look for missing indexes in explain plans. 5) Check if delta merge is running (M_DELTA_MERGE_STATISTICS). 6) Consider killing top consumer: ALTER SYSTEM CANCEL SESSION. 7) Create incident, page on-call if sustained >5 min.' },
  { id: 'incident-mem', title: 'High Memory Incident Runbook', tags: ['incident','memory','runbook','oom','triage'], source: 'VynSAP Runbooks', content: 'Memory > 95% of ALLOCATION_LIMIT: 1) Check M_CS_TABLES for largest in-memory tables. 2) Unload cold tables: ALTER TABLE schema.table UNLOAD. 3) Check heap: M_HEAP_MEMORY for allocator memory. 4) Look for memory leaks in M_MEMORY_OBJECTS. 5) Consider increasing GLOBAL_ALLOCATION_LIMIT if headroom exists. 6) Page on-call if auto-unload begins causing query failures. Monitor M_CS_UNLOADS for cascading unloads.' },
]

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/).filter(t => t.length > 2)
}

function bm25Score(chunk: KnowledgeChunk, queryTokens: string[]): number {
  const k1 = 1.5, b = 0.75
  const docTokens = tokenize(chunk.title + ' ' + chunk.tags.join(' ') + ' ' + chunk.content)
  const avgDocLen = 200
  const docLen = docTokens.length
  let score = 0
  for (const qt of queryTokens) {
    const tf = docTokens.filter(t => t === qt).length
    if (tf === 0) continue
    const numerator = tf * (k1 + 1)
    const denominator = tf + k1 * (1 - b + b * (docLen / avgDocLen))
    score += numerator / denominator
  }
  return score
}

function runbookChunks(): KnowledgeChunk[] {
  try {
    const history = loadCopilotHistory().slice(0, 50)
    return history
      .filter(h => h.prompt.length > 20 && h.reply.length > 50)
      .map(h => ({
        id: `hist-${h.id}`,
        title: h.prompt.slice(0, 80),
        tags: ['runbook', 'history'],
        content: `Q: ${h.prompt}\nA: ${h.reply.slice(0, 600)}`,
        source: 'Copilot History',
      }))
  } catch { return [] }
}

export function retrieveChunks(query: string, topK = 3): KnowledgeChunk[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []
  const allChunks = [...BUILT_IN_CHUNKS, ...runbookChunks()]
  const scored = allChunks.map(chunk => ({ chunk, score: bm25Score(chunk, queryTokens) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.filter(x => x.score > 0).slice(0, topK).map(x => x.chunk)
}

export function buildRagContext(query: string): string {
  const chunks = retrieveChunks(query, 3)
  if (chunks.length === 0) return ''
  return '\n\n--- Relevant Knowledge ---\n' + chunks.map(c => `[${c.source}] ${c.title}:\n${c.content}`).join('\n\n')
}
