import fs from 'fs'
import path from 'path'
import { writeFileSync } from 'atomically'

const FILE = path.join(process.cwd(), 'data', 'audit.json')

export type AuditAction =
  | 'approve_proposal' | 'reject_proposal' | 'apply_proposal' | 'delete_proposal' | 'generate_proposals'
  | 'create_rule' | 'update_rule' | 'delete_rule' | 'run_rule' | 'enable_rule' | 'disable_rule'
  | 'create_incident' | 'update_incident' | 'delete_incident' | 'add_note'
  | 'create_schedule' | 'update_schedule' | 'rotate_schedule' | 'escalate_schedule' | 'delete_schedule'
  | 'add_connection' | 'update_connection' | 'delete_connection'
  | 'update_settings' | 'test_integration'
  | 'create_transport' | 'approve_transport' | 'reject_transport' | 'apply_transport'
  | 'copilot_query' | 'scheduler_fire' | 'change_password' | 'reset_password'
  | 'change_role' | 'activate_user' | 'deactivate_user' | 'delete_user'
  | 'notification_delivery'

export interface AuditEntry {
  id: string
  ts: string
  actor: string
  actorRole: string
  action: AuditAction
  resource: string
  resourceId?: string
  detail?: string
  outcome: 'success' | 'failure'
}

function read(): AuditEntry[] {
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    if (!Array.isArray(list)) throw new Error('Invalid audit history')
    return list
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
function write(list: AuditEntry[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
}

export function appendAudit(entry: Omit<AuditEntry, 'id' | 'ts'>): AuditEntry {
  const rec: AuditEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    ...entry,
  }
  const list = read()
  list.unshift(rec)
  // Keep last 10 000 entries
  write(list.slice(0, 10000))
  return rec
}

export function loadAudit(limit = 200, action?: AuditAction, actor?: string): AuditEntry[] {
  let list = read()
  if (action) list = list.filter(e => e.action === action)
  if (actor)  list = list.filter(e => e.actor === actor)
  return list.slice(0, limit)
}
