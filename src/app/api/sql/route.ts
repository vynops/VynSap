import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { queryErp } from '@/lib/erp-client'
import { appendAudit } from '@/lib/audit-store'
import { validateReadOnlySql } from '@/lib/sql-guard'

const MAX_ROWS = 500
const MAX_SQL_LENGTH = 10000

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, 'editor')
  if (auth instanceof NextResponse) return auth

  const { connId, sql } = await req.json().catch(() => ({}))
  if (!connId) return NextResponse.json({ error: 'Select a connection first.' }, { status: 400 })
  if (typeof sql !== 'string' || !sql.trim()) return NextResponse.json({ error: 'Enter a SQL statement.' }, { status: 400 })
  if (sql.length > MAX_SQL_LENGTH) return NextResponse.json({ error: 'Statement is too long.' }, { status: 400 })

  const conn = loadConnections().find(c => c.id === connId)
  if (!conn) return NextResponse.json({ error: 'Connection not found.' }, { status: 404 })
  if ((conn.dbType ?? 'hana') !== 'hana') {
    return NextResponse.json({ error: 'The SQL console only supports HANA connections.' }, { status: 400 })
  }

  const audit = (outcome: 'success' | 'failure', detail: string) =>
    appendAudit({ actor: auth.email, actorRole: auth.role, action: 'sql_query', resource: 'sql-console', resourceId: conn.id, detail: detail.slice(0, 300), outcome })

  const invalid = validateReadOnlySql(sql)
  if (invalid) {
    audit('failure', `REJECTED: ${sql.trim().replace(/\s+/g, ' ')}`)
    return NextResponse.json({ error: invalid }, { status: 400 })
  }

  const trimmed = sql.trim().replace(/;\s*$/, '')
  const autoLimited = !/\bLIMIT\s+\d+/i.test(trimmed) && !/^\s*SELECT\s+(DISTINCT\s+)?TOP\s+\d+/i.test(trimmed)
  const finalSql = autoLimited ? `${trimmed}\nLIMIT ${MAX_ROWS}` : trimmed

  const start = Date.now()
  try {
    const rows = (await queryErp(conn, finalSql, [], { throwOnError: true })).slice(0, MAX_ROWS)
    audit('success', `${conn.name}: ${trimmed.replace(/\s+/g, ' ')} (${rows.length} rows)`)
    return NextResponse.json({ rows, rowCount: rows.length, elapsed: Date.now() - start, autoLimited })
  } catch (e) {
    const message = (e as Error).message
    audit('failure', `${conn.name}: ${trimmed.replace(/\s+/g, ' ')} | ${message}`)
    return NextResponse.json({ error: message, elapsed: Date.now() - start }, { status: 400 })
  }
}
