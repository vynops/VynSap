import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  loadConnections, saveConnection, newConnectionId, encryptPassword, ErpConnection
} from '@/lib/connection-store'
import { getConnectorHealth } from '@/lib/erp-client'

function parseEndpoint(endpointUrl: string): { host: string; port: number } {
  try {
    const u = new URL(endpointUrl)
    const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80)
    return { host: u.hostname, port }
  } catch {
    return { host: '', port: 443 }
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const now = Date.now()
  const rows = loadConnections().map(conn => {
    const checked = new Date(conn.lastChecked).getTime()
    const freshnessLagMins = Number.isFinite(checked)
      ? Math.max(0, Math.round((now - checked) / 60000))
      : null
    return {
      ...conn,
      freshnessLagMins,
      freshnessState: freshnessLagMins === null
        ? 'unknown'
        : freshnessLagMins <= 5
          ? 'fresh'
          : freshnessLagMins <= 30
            ? 'aging'
            : 'stale',
    }
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const endpointUrl = String(body.endpointUrl ?? '').trim()
  const parsed = parseEndpoint(endpointUrl)

  const conn: ErpConnection = {
    id: newConnectionId(),
    name: body.name,
    connectorType: body.connectorType ?? 'odata',
    endpointUrl,
    sapClient: String(body.sapClient ?? '100'),
    systemNumber: String(body.systemNumber ?? '00'),
    language: String(body.language ?? 'EN'),
    authType: body.authType ?? 'basic',
    host: parsed.host || body.host || '',
    port: Number(parsed.port) || Number(body.port) || 443,
    database: body.database || 'N/A',
    username: body.username,
    passwordEnc: encryptPassword(body.password ?? ''),
    ssl: body.ssl ?? false,
    sslValidateCert: body.sslValidateCert ?? true,
    environment: body.environment ?? 'development',
    isMDC: false,
    isSystemDB: false,
    sid: body.sapClient ?? '',
    instanceNumber: body.systemNumber ?? '',
    tags: body.tags ?? [],
    notes: body.notes ?? '',
    status: 'unknown',
    healthScore: 0,
    lastChecked: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
  // Quick connector health test
  try {
    const connectors = await getConnectorHealth(conn)
    const failed = connectors.filter(c => c.status === 'failed').length
    const connected = connectors.filter(c => c.status === 'connected').length
    conn.status = failed === connectors.length ? 'error' : connected > 0 ? 'connected' : 'warning'
    conn.healthScore = Math.max(30, Math.min(100, Math.round((connected / connectors.length) * 100)))
    conn.version = 'ERP Application Connector Profile'
  } catch {
    conn.status = 'error'
    conn.healthScore = 0
  }
  conn.lastChecked = new Date().toISOString()
  saveConnection(conn)
  return NextResponse.json(conn, { status: 201 })
}
