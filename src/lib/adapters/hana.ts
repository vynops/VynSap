/**
 * SAP HANA adapter — runs HANA SQL (M_* views) natively through @sap/hana-client.
 */
import type { ErpConnection } from '../connection-store'
import { decryptPassword } from '../connection-store'

type Row = Record<string, unknown>

interface HanaClientConnection {
  connect(params: Record<string, unknown>, cb: (err: Error | null) => void): void
  exec(sql: string, cb: (err: Error | null, rows: Row[]) => void): void
  exec(sql: string, params: unknown[], cb: (err: Error | null, rows: Row[]) => void): void
  disconnect(): void
  state(): string
}

const pool = new Map<string, HanaClientConnection>()

function loadDriver(): { createConnection(): HanaClientConnection } {
  // Required lazily so a missing native module only affects HANA connections.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@sap/hana-client')
}

function buildParams(conn: ErpConnection): Record<string, unknown> {
  const params: Record<string, unknown> = {
    serverNode: `${conn.host}:${conn.port}`,
    uid: conn.username,
    pwd: decryptPassword(conn.passwordEnc),
    connectTimeout: 10000,
    communicationTimeout: 30000,
    encrypt: conn.ssl ? 'true' : 'false',
  }
  // HANA Cloud resolves the target database itself; passing a name breaks the connection.
  if (!conn.host.toLowerCase().includes('hanacloud.ondemand.com') && conn.database) {
    params.databaseName = conn.database
  }
  if (conn.ssl && !conn.sslValidateCert) params.sslValidateCertificate = 'false'
  return params
}

async function getConnection(conn: ErpConnection): Promise<HanaClientConnection> {
  const existing = pool.get(conn.id)
  if (existing && existing.state() === 'connected') return existing

  return new Promise((resolve, reject) => {
    let c: HanaClientConnection
    try {
      c = loadDriver().createConnection()
    } catch (e) {
      reject(e)
      return
    }
    c.connect(buildParams(conn), err => {
      if (err) {
        reject(err)
        return
      }
      pool.set(conn.id, c)
      resolve(c)
    })
  })
}

export async function queryHana(conn: ErpConnection, sql: string, params?: unknown[]): Promise<Row[]> {
  const c = await getConnection(conn)
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, rows: Row[]) => (err ? reject(err) : resolve(rows ?? []))
    if (params && params.length > 0) c.exec(sql, params, cb)
    else c.exec(sql, cb)
  })
}

export function removeHanaFromPool(id: string): void {
  const c = pool.get(id)
  if (!c) return
  try { c.disconnect() } catch { /* already closed */ }
  pool.delete(id)
}
