import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DATA_DIR = path.join(process.cwd(), 'data')

export const DEMO_CONN_ID = 'erp-demo'

export type ErpEnv = 'production' | 'staging' | 'development' | 'test'
export type ErpStatus = 'connected' | 'warning' | 'error' | 'unknown'
export type ErpConnectorType = 'odata' | 'rfc' | 'bapi'
export type ErpAuthType = 'basic' | 'oauth2' | 'saml'
export type DbType = 'hana' | 'postgres' | 'mysql' | 'redis' | 'mongodb'

export interface ErpConnection {
  dbType?: DbType
  id: string
  name: string
  connectorType: ErpConnectorType
  endpointUrl: string
  sapClient: string
  systemNumber: string
  language: string
  authType: ErpAuthType
  host: string
  port: number                // default 39015 (tenant) or 39013 (system)
  database: string            // DB name or 'SYSTEMDB'
  username: string
  passwordEnc: string         // XOR-obfuscated
  ssl: boolean
  sslValidateCert: boolean
  environment: ErpEnv
  status: ErpStatus
  healthScore: number
  lastChecked: string
  version?: string
  sid?: string                // ERP SID e.g. HDB
  instanceNumber?: string     // 2-digit instance number
  isMDC: boolean              // Multi-Database Container
  isSystemDB: boolean
  notes?: string
  tags: string[]
  createdAt: string
  /** Set only on the synthetic demo connection — never persisted to disk */
  _isDemo?: boolean
}

export function isDemoConnection(conn: Pick<ErpConnection, 'id' | 'name' | 'host' | 'notes' | 'tags' | '_isDemo'>): boolean {
  if (conn._isDemo) return true
  if (conn.id === DEMO_CONN_ID) return true

  const host = (conn.host ?? '').toLowerCase()
  const name = (conn.name ?? '').toLowerCase()
  const notes = (conn.notes ?? '').toLowerCase()
  const tags = Array.isArray(conn.tags) ? conn.tags.map(t => String(t).toLowerCase()) : []

  const hasDemoTag = tags.some(t => t === 'demo' || t === 'sample-data' || t === 'mock')
  const hostLooksDemo = host.includes('demo') || host.endsWith('.local')
  const nameLooksDemo = name.includes('demo')
  const notesLooksDemo = notes.includes('demo') || notes.includes('simulated') || notes.includes('sample')

  return hasDemoTag || (hostLooksDemo && (nameLooksDemo || notesLooksDemo))
}

function xor(s: string): string {
  const key = 0x5a
  return Buffer.from(Buffer.from(s).map(b => b ^ key)).toString('base64')
}

export function decryptPassword(enc: string): string {
  try {
    return Buffer.from(enc, 'base64').map(b => b ^ 0x5a).toString()
  } catch {
    return enc
  }
}

const FILE = path.join(DATA_DIR, 'connections.json')

function read(): ErpConnection[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return []
  }
}

function write(list: ErpConnection[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
}

function getDemoConnection(): ErpConnection {
  return {
    id: DEMO_CONN_ID,
    name: 'SAP ERP Demo System',
    connectorType: 'odata',
    endpointUrl: 'https://demo.erp.local/sap/opu/odata',
    sapClient: '100',
    systemNumber: '00',
    language: 'EN',
    authType: 'basic',
    host: 'demo-erp.vynsap.local',
    port: 39015,
    database: 'SYSTEMDB',
    username: 'SYSTEM',
    passwordEnc: '',
    ssl: false,
    sslValidateCert: false,
    environment: 'development',
    status: 'connected',
    healthScore: 92,
    lastChecked: new Date().toISOString(),
    version: '2.00.070.00 (hdbindexserver 2.00.070.00.1712066413)',
    sid: 'HDB',
    instanceNumber: '00',
    isMDC: true,
    isSystemDB: true,
    notes: 'Demo connection — add a real SAP ERP system to see live data.',
    tags: ['demo'],
    createdAt: new Date().toISOString(),
    _isDemo: true,
  }
}

export function loadConnections(): ErpConnection[] {
  const list = read()
  if (list.length === 0) return [getDemoConnection()]
  return list.map(conn => {
    const normalized: ErpConnection = {
      ...conn,
      connectorType: conn.connectorType ?? 'odata',
      endpointUrl: conn.endpointUrl ?? `https://${conn.host}/sap/opu/odata`,
      sapClient: conn.sapClient ?? '100',
      systemNumber: conn.systemNumber ?? conn.instanceNumber ?? '00',
      language: conn.language ?? 'EN',
      authType: conn.authType ?? 'basic',
    }
    if (!isDemoConnection(conn)) return { ...normalized, _isDemo: false }
    return {
      ...normalized,
      _isDemo: true,
      status: 'connected',
      healthScore: conn.healthScore > 0 ? conn.healthScore : 92,
      lastChecked: conn.lastChecked || new Date().toISOString(),
    }
  })
}

export function isDemoWorkspace(): boolean {
  const list = read()
  if (list.length === 0) return true
  return list.every(conn => isDemoConnection(conn))
}

export function saveConnection(conn: ErpConnection) {
  if (isDemoConnection(conn)) return // never persist demo connections
  const list = read()
  const idx = list.findIndex(c => c.id === conn.id)
  if (idx >= 0) list[idx] = conn
  else list.push(conn)
  write(list)
}

export function deleteConnection(id: string) {
  const list = read()
  const target = list.find(c => c.id === id)
  if (target && isDemoConnection(target)) return // demo connection cannot be deleted
  write(list.filter(c => c.id !== id))
}

export function encryptPassword(plain: string): string {
  return xor(plain)
}

export function newConnectionId(): string {
  return `erp-${crypto.randomUUID().slice(0, 8)}`
}
