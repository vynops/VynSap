import type { ErpConnection } from './connection-store'
import { decryptPassword, isDemoConnection } from './connection-store'
import { appendConnectorLatencySamples } from './telemetry-store'

export type ConnectorType = 'odata' | 'rfc' | 'bapi'
export type ConnectorStatus = 'connected' | 'degraded' | 'failed'
export type ErpModuleCode = 'FI' | 'MM' | 'SD' | 'PP' | 'HCM'

export interface ConnectorHealth {
  type: ConnectorType
  status: ConnectorStatus
  latencyMs: number
  endpoint: string
  checkedAt: string
  message: string
}

export interface ProcessKpi {
  key: 'orderToCash' | 'procureToPay' | 'recordToReport' | 'hireToRetire'
  label: string
  throughput: number
  failed: number
  backlog: number
  avgCycleMins: number
  slaPct: number
}

export interface ModuleHealth {
  code: ErpModuleCode
  name: string
  availabilityPct: number
  failedTransactions: number
  queueBacklog: number
  integrationLagMins: number
  topIssue: string
}

export interface ErpBusinessEvent {
  id: string
  module: ErpModuleCode
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  ageMins: number
}

export interface ErpAppOverview {
  generatedAt: string
  system: {
    id: string
    name: string
    environment: string
    host: string
  }
  connectors: ConnectorHealth[]
  processes: ProcessKpi[]
  modules: ModuleHealth[]
  events: ErpBusinessEvent[]
}

export interface ProcessTrendPoint {
  ts: string
  throughput: number
  failed: number
  backlog: number
  slaPct: number
}

export interface ProcessTrends {
  last24h: ProcessTrendPoint[]
  last7d: ProcessTrendPoint[]
}

function baseSeed(conn: ErpConnection): number {
  const s = `${conn.id}:${conn.name}:${conn.environment}`
  let n = 0
  for (let i = 0; i < s.length; i += 1) n = (n + s.charCodeAt(i) * (i + 1)) % 100000
  return n
}

function pct(seed: number, min: number, max: number): number {
  return Number((min + ((seed % 1000) / 1000) * (max - min)).toFixed(1))
}

async function pingOData(conn: ErpConnection): Promise<ConnectorHealth> {
  const endpoint = `https://${conn.host}/sap/opu/odata`
  const checkedAt = new Date().toISOString()
  const start = Date.now()
  if (isDemoConnection(conn)) {
    return { type: 'odata', status: 'connected', latencyMs: 92, endpoint, checkedAt, message: 'Demo OData adapter is active' }
  }

  const basic = Buffer.from(`${conn.username}:${decryptPassword(conn.passwordEnc)}`).toString('base64')
  try {
    const res = await fetch(`${endpoint}/$metadata`, {
      method: 'GET',
      headers: { Authorization: `Basic ${basic}` },
    })
    const latencyMs = Date.now() - start
    if (res.ok) {
      return { type: 'odata', status: 'connected', latencyMs, endpoint, checkedAt, message: 'OData metadata reachable' }
    }
    return { type: 'odata', status: 'degraded', latencyMs, endpoint, checkedAt, message: `OData returned ${res.status}` }
  } catch (e) {
    return {
      type: 'odata',
      status: 'failed',
      latencyMs: Date.now() - start,
      endpoint,
      checkedAt,
      message: `OData ping failed: ${(e as Error).message}`,
    }
  }
}

function syntheticConnector(type: ConnectorType, conn: ErpConnection, seed: number): ConnectorHealth {
  const checkedAt = new Date().toISOString()
  const latencyMs = Math.round(80 + (seed % 170))
  const status: ConnectorStatus = latencyMs < 180 ? 'connected' : latencyMs < 240 ? 'degraded' : 'failed'
  const endpoint = type === 'rfc'
    ? `${conn.host}:${conn.port}/rfc`
    : `${conn.host}:${conn.port}/bapi`
  const message = status === 'connected'
    ? `${type.toUpperCase()} channel healthy`
    : status === 'degraded'
      ? `${type.toUpperCase()} latency elevated`
      : `${type.toUpperCase()} requires attention`
  return { type, status, latencyMs, endpoint, checkedAt, message }
}

async function pingHttpConnector(
  conn: ErpConnection,
  type: Extract<ConnectorType, 'rfc' | 'bapi'>,
  seed: number
): Promise<ConnectorHealth> {
  const checkedAt = new Date().toISOString()
  const protocol = conn.ssl ? 'https' : 'http'
  const endpoint = `${protocol}://${conn.host}:${conn.port}/${type}`

  if (isDemoConnection(conn)) {
    const demo = syntheticConnector(type, conn, seed)
    return { ...demo, endpoint, checkedAt, message: `Demo ${type.toUpperCase()} adapter is active` }
  }

  const start = Date.now()
  const pwd = decryptPassword(conn.passwordEnc)
  const basic = Buffer.from(`${conn.username}:${pwd}`).toString('base64')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Basic ${basic}` },
      signal: controller.signal,
    })
    const latencyMs = Date.now() - start
    if (res.ok) {
      return {
        type,
        status: 'connected',
        latencyMs,
        endpoint,
        checkedAt,
        message: `${type.toUpperCase()} endpoint reachable`,
      }
    }
    return {
      type,
      status: res.status < 500 ? 'degraded' : 'failed',
      latencyMs,
      endpoint,
      checkedAt,
      message: `${type.toUpperCase()} returned ${res.status}`,
    }
  } catch (e) {
    return {
      type,
      status: 'failed',
      latencyMs: Date.now() - start,
      endpoint,
      checkedAt,
      message: `${type.toUpperCase()} ping failed: ${(e as Error).message}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildProcesses(conn: ErpConnection, seed: number): ProcessKpi[] {
  return [
    {
      key: 'orderToCash',
      label: 'Order-to-Cash',
      throughput: 680 + (seed % 120),
      failed: 4 + (seed % 5),
      backlog: 22 + (seed % 11),
      avgCycleMins: 48 + (seed % 9),
      slaPct: pct(seed + 11, 97, 99.9),
    },
    {
      key: 'procureToPay',
      label: 'Procure-to-Pay',
      throughput: 510 + (seed % 80),
      failed: 6 + (seed % 6),
      backlog: 31 + (seed % 13),
      avgCycleMins: 62 + (seed % 11),
      slaPct: pct(seed + 29, 96, 99.6),
    },
    {
      key: 'recordToReport',
      label: 'Record-to-Report',
      throughput: 220 + (seed % 60),
      failed: 2 + (seed % 3),
      backlog: 12 + (seed % 7),
      avgCycleMins: 84 + (seed % 12),
      slaPct: pct(seed + 47, 97.2, 99.9),
    },
    {
      key: 'hireToRetire',
      label: 'Hire-to-Retire',
      throughput: 150 + (seed % 45),
      failed: 1 + (seed % 4),
      backlog: 9 + (seed % 6),
      avgCycleMins: 72 + (seed % 10),
      slaPct: pct(seed + 63, 96.5, 99.4),
    },
  ]
}

function buildModules(seed: number): ModuleHealth[] {
  return [
    { code: 'FI', name: 'Financial Accounting', availabilityPct: pct(seed + 3, 98.1, 99.97), failedTransactions: 5 + (seed % 4), queueBacklog: 14 + (seed % 6), integrationLagMins: 3 + (seed % 4), topIssue: 'Journal posting retry spike' },
    { code: 'MM', name: 'Materials Management', availabilityPct: pct(seed + 5, 97.8, 99.9), failedTransactions: 7 + (seed % 5), queueBacklog: 21 + (seed % 7), integrationLagMins: 4 + (seed % 5), topIssue: 'PO approval queue delay' },
    { code: 'SD', name: 'Sales and Distribution', availabilityPct: pct(seed + 7, 98.2, 99.95), failedTransactions: 3 + (seed % 4), queueBacklog: 18 + (seed % 6), integrationLagMins: 2 + (seed % 4), topIssue: 'Billing sync mismatch' },
    { code: 'PP', name: 'Production Planning', availabilityPct: pct(seed + 11, 97.6, 99.8), failedTransactions: 6 + (seed % 5), queueBacklog: 25 + (seed % 8), integrationLagMins: 5 + (seed % 6), topIssue: 'MRP execution backlog' },
    { code: 'HCM', name: 'Human Capital Management', availabilityPct: pct(seed + 13, 98, 99.92), failedTransactions: 2 + (seed % 3), queueBacklog: 10 + (seed % 5), integrationLagMins: 2 + (seed % 3), topIssue: 'Payroll export timeout' },
  ]
}

function buildEvents(seed: number): ErpBusinessEvent[] {
  return [
    { id: `evt-${seed}-1`, module: 'FI', severity: 'high', title: 'Posting interface delay above threshold', ageMins: 14 + (seed % 20) },
    { id: `evt-${seed}-2`, module: 'MM', severity: 'medium', title: 'Purchase requisition approvals building up', ageMins: 9 + (seed % 25) },
    { id: `evt-${seed}-3`, module: 'SD', severity: 'critical', title: 'Delivery confirmation retry storm', ageMins: 4 + (seed % 10) },
  ]
}

function buildTrendSeries(seed: number, process: ProcessKpi, points: number, stepHours: number): ProcessTrendPoint[] {
  const now = Date.now()
  const trend: ProcessTrendPoint[] = []
  for (let i = points - 1; i >= 0; i -= 1) {
    const ts = new Date(now - i * stepHours * 3600 * 1000).toISOString()
    const wobble = ((seed + i * 17) % 11) - 5
    const throughput = Math.max(50, process.throughput + wobble * 4)
    const failed = Math.max(0, process.failed + Math.round(wobble / 3))
    const backlog = Math.max(0, process.backlog + wobble)
    const slaPct = Number(Math.max(94, Math.min(99.95, process.slaPct - wobble * 0.08)).toFixed(2))
    trend.push({ ts, throughput, failed, backlog, slaPct })
  }
  return trend
}

export function getProcessTrends(conn: ErpConnection): Record<ProcessKpi['key'], ProcessTrends> {
  const seed = baseSeed(conn)
  const processes = buildProcesses(conn, seed)
  const out = {} as Record<ProcessKpi['key'], ProcessTrends>

  for (const p of processes) {
    out[p.key] = {
      last24h: buildTrendSeries(seed + p.label.length, p, 24, 1),
      last7d: buildTrendSeries(seed + p.label.length * 3, p, 7, 24),
    }
  }

  return out
}

export async function getConnectorHealth(conn: ErpConnection): Promise<ConnectorHealth[]> {
  const seed = baseSeed(conn)
  const [odata, rfc, bapi] = await Promise.all([
    pingOData(conn),
    pingHttpConnector(conn, 'rfc', seed + 17),
    pingHttpConnector(conn, 'bapi', seed + 31),
  ])

  const health = [odata, rfc, bapi]
  appendConnectorLatencySamples(
    health.map(h => ({
      connId: conn.id,
      connectorType: h.type,
      latencyMs: h.latencyMs,
      status: h.status,
      at: h.checkedAt,
    }))
  )
  return health
}

export async function getErpAppOverview(conn: ErpConnection): Promise<ErpAppOverview> {
  const seed = baseSeed(conn)
  const [connectors] = await Promise.all([getConnectorHealth(conn)])
  return {
    generatedAt: new Date().toISOString(),
    system: {
      id: conn.id,
      name: conn.name,
      environment: conn.environment,
      host: conn.host,
    },
    connectors,
    processes: buildProcesses(conn, seed),
    modules: buildModules(seed),
    events: buildEvents(seed),
  }
}

export async function getModuleHealth(conn: ErpConnection, code?: string): Promise<ModuleHealth[]> {
  const modules = buildModules(baseSeed(conn))
  if (!code) return modules
  const upper = code.toUpperCase()
  return modules.filter(m => m.code === upper)
}

export async function queryErp(
  conn?: ErpConnection,
  query?: string,
  _params?: unknown[]
): Promise<Record<string, unknown>[]> {
  if (!conn || !query) return []

  if (isDemoConnection(conn)) {
    const { mockQuery } = await import('./mock-erp')
    return mockQuery(query) as Record<string, unknown>[]
  }

  const dbType = conn.dbType ?? 'hana'

  try {
    if (dbType === 'postgres') {
      const { queryPostgres } = await import('./adapters/postgres')
      return queryPostgres(conn, query)
    }
    if (dbType === 'mysql') {
      const { queryMySQL } = await import('./adapters/mysql')
      return queryMySQL(conn, query)
    }
    if (dbType === 'redis') {
      const { queryRedis } = await import('./adapters/redis')
      return queryRedis(conn, query)
    }
    if (dbType === 'mongodb') {
      const { queryMongoDB } = await import('./adapters/mongodb')
      return queryMongoDB(conn, query)
    }
    // hana: real HANA HTTP client would go here — return empty until connected
    return []
  } catch (e) {
    console.error(`[queryErp] ${conn.name} (${dbType}):`, (e as Error).message)
    return []
  }
}

export function removeFromPool(_id?: string): void { /* stateless per request */ }
