import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isDemoWorkspace, loadConnections } from './connection-store'

const FILE = path.join(process.cwd(), 'data', 'incidents.json')

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low'
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed'

export interface Incident {
  id: string
  title: string
  description: string
  severity: IncidentSeverity
  status: IncidentStatus
  connectionId?: string
  connectionName?: string
  assignee?: string
  tags: string[]
  timeline: { at: string; by: string; note: string }[]
  createdAt: string
  updatedAt: string
  resolvedAt?: string
}

function read(): Incident[] {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}
function write(list: Incident[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
}

function demoIncidents(): Incident[] {
  const conn = loadConnections()[0]
  const now = Date.now()
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString()

  return [
    {
      id: 'demo-inc-1',
      title: 'Indexserver CPU saturation on reporting workload',
      description: 'Morning reporting burst pushed indexserver CPU over sustained threshold; query queue depth increased.',
      severity: 'high',
      status: 'investigating',
      connectionId: conn?.id,
      connectionName: conn?.name,
      assignee: 'Priya DBA',
      tags: ['cpu', 'reporting', 'production'],
      timeline: [
        { at: iso(6), by: 'monitor', note: 'Incident created from sustained CPU spike alert' },
        { at: iso(5.5), by: 'Priya DBA', note: 'Initial triage started; isolating expensive statements' },
      ],
      createdAt: iso(6),
      updatedAt: iso(5.5),
    },
    {
      id: 'demo-inc-2',
      title: 'Backup catalog lag detected',
      description: 'Scheduled backup completed later than expected and exceeded backup policy target by 42 minutes.',
      severity: 'medium',
      status: 'open',
      connectionId: conn?.id,
      connectionName: conn?.name,
      assignee: 'Alex DBA',
      tags: ['backup', 'sla'],
      timeline: [
        { at: iso(3), by: 'monitor', note: 'Incident created from backup freshness rule' },
      ],
      createdAt: iso(3),
      updatedAt: iso(3),
    },
    {
      id: 'demo-inc-3',
      title: 'Column store unload storm stabilized',
      description: 'Frequent unloads on BALDAT and INDX tables impacted user response times during peak traffic.',
      severity: 'critical',
      status: 'resolved',
      connectionId: conn?.id,
      connectionName: conn?.name,
      assignee: 'Maria SRE',
      tags: ['memory', 'column-store'],
      timeline: [
        { at: iso(28), by: 'monitor', note: 'Incident opened for repeated unload activity' },
        { at: iso(26), by: 'Maria SRE', note: 'Triggered manual delta merge and adjusted memory pressure thresholds' },
        { at: iso(22), by: 'Maria SRE', note: 'Incident resolved after unload rate normalized' },
      ],
      createdAt: iso(28),
      updatedAt: iso(22),
      resolvedAt: iso(22),
    },
  ]
}

export function loadIncidents(): Incident[] {
  const list = read()
  if (list.length === 0 && isDemoWorkspace()) return demoIncidents()
  return list
}

export function saveIncident(inc: Incident) {
  const list = read()
  const idx = list.findIndex(i => i.id === inc.id)
  if (idx >= 0) list[idx] = inc
  else list.push(inc)
  write(list)
}

export function deleteIncident(id: string) {
  write(read().filter(i => i.id !== id))
}

export function createIncident(partial: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'timeline'>): Incident {
  const now = new Date().toISOString()
  return {
    ...partial,
    id: `inc-${crypto.randomUUID().slice(0, 8)}`,
    timeline: [{ at: now, by: 'system', note: 'Incident created' }],
    createdAt: now,
    updatedAt: now,
  }
}
