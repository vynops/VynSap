import type { ErpConnection } from './connection-store'

export interface SapJobStatus {
  JobName: string
  Status: string
  LastRunUtc?: string
  DurationSeconds?: number
  Message?: string
}

export interface SapInterfaceStatus {
  InterfaceId: string
  Direction?: string
  Status: string
  Backlog?: number
  Message?: string
}

function serviceUrl(conn: ErpConnection, collection: string): URL {
  if (!/^[A-Za-z0-9_]+$/.test(collection)) throw new Error('Invalid OData collection')
  const root = new URL(conn.endpointUrl)
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(root.hostname.toLowerCase())
  if (root.protocol !== 'https:' && !(root.protocol === 'http:' && loopback && ['development', 'test'].includes(conn.environment))) {
    throw new Error('SAP OData requires HTTPS; HTTP is allowed only for a local development/test endpoint')
  }
  root.pathname = `${root.pathname.replace(/\/+$/, '')}/${collection}`
  root.search = '$format=json'
  return root
}

export async function fetchSapODataSet<T>(conn: ErpConnection, collection: string): Promise<T[]> {
  const url = serviceUrl(conn, collection)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (conn.username) {
    const { decryptPassword } = await import('./connection-store')
    const password = decryptPassword(conn.passwordEnc)
    headers.Authorization = `Basic ${Buffer.from(`${conn.username}:${password}`).toString('base64')}`
  }

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`SAP OData collection request failed (${response.status})`)

  const payload = await response.json() as { d?: { results?: unknown }; value?: unknown }
  const rows = Array.isArray(payload.d?.results) ? payload.d.results : payload.value
  if (!Array.isArray(rows)) throw new Error('SAP OData response did not contain a collection')
  return rows as T[]
}

export async function getSapOperations(conn: ErpConnection): Promise<{
  checkedAt: string
  jobs: SapJobStatus[]
  interfaces: SapInterfaceStatus[]
}> {
  const [jobs, interfaces] = await Promise.all([
    fetchSapODataSet<SapJobStatus>(conn, 'JobStatusSet'),
    fetchSapODataSet<SapInterfaceStatus>(conn, 'InterfaceStatusSet'),
  ])
  return { checkedAt: new Date().toISOString(), jobs, interfaces }
}