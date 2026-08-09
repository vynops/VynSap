import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isDemoWorkspace } from './connection-store'

const FILE = path.join(process.cwd(), 'data', 'oncall.json')

export type RotationType = 'weekly' | 'biweekly' | 'daily' | 'custom'

export interface OncallMember {
  id: string
  name: string
  email: string
  phone?: string
  slackHandle?: string
  timezone: string
}

export interface OncallSchedule {
  id: string
  name: string
  rotation: RotationType
  members: OncallMember[]
  currentOnCall?: string   // member id
  escalation: OncallMember[]
  createdAt: string
  updatedAt?: string
}

export interface OncallEscalation {
  id: string
  scheduleId: string
  incidentId?: string
  escalatedTo: string
  reason: string
  at: string
  scheduleName?: string
  incidentTitle?: string
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string
}

function read(): { schedules: OncallSchedule[]; escalations: OncallEscalation[] } {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as unknown
    if (Array.isArray(raw)) return { schedules: [], escalations: [] }
    if (!raw || typeof raw !== 'object') return { schedules: [], escalations: [] }
    const obj = raw as { schedules?: unknown; escalations?: unknown }
    return {
      schedules: Array.isArray(obj.schedules) ? obj.schedules as OncallSchedule[] : [],
      escalations: Array.isArray(obj.escalations) ? obj.escalations as OncallEscalation[] : [],
    }
  } catch {
    return { schedules: [], escalations: [] }
  }
}
function write(data: { schedules: OncallSchedule[]; escalations: OncallEscalation[] }) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
}

function demoData(): { schedules: OncallSchedule[]; escalations: OncallEscalation[] } {
  const now = Date.now()
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString()

  const primaryMembers: OncallMember[] = [
    { id: 'm-1', name: 'Alex DBA', email: 'alex.dba@vynsap.local', timezone: 'UTC', phone: '+44 7000 100 101', slackHandle: '@alex' },
    { id: 'm-2', name: 'Priya DBA', email: 'priya.dba@vynsap.local', timezone: 'UTC+5:30', phone: '+91 9000 100 202', slackHandle: '@priya' },
    { id: 'm-3', name: 'Maria SRE', email: 'maria.sre@vynsap.local', timezone: 'UTC+1', phone: '+49 3000 100 303', slackHandle: '@maria' },
  ]

  const schedule: OncallSchedule = {
    id: 'oncall-demo-primary',
    name: 'Primary DBA Rotation',
    rotation: 'weekly',
    members: primaryMembers,
    currentOnCall: 'm-2',
    escalation: [primaryMembers[2], primaryMembers[0]],
    createdAt: iso(240),
    updatedAt: iso(5),
  }

  return {
    schedules: [schedule],
    escalations: [
      {
        id: 'esc-demo-1',
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        incidentId: 'demo-inc-1',
        incidentTitle: 'Indexserver CPU saturation on reporting workload',
        escalatedTo: 'Maria SRE <maria.sre@vynsap.local>',
        reason: 'Escalated after 30 minutes without CPU stabilization',
        at: iso(4),
        resolved: false,
      },
      {
        id: 'esc-demo-2',
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        escalatedTo: 'Alex DBA <alex.dba@vynsap.local>',
        reason: 'After-hours backup policy review',
        at: iso(32),
        resolved: true,
        resolvedAt: iso(30),
        resolvedBy: 'Alex DBA',
      },
    ],
  }
}

export function loadSchedules(): OncallSchedule[] {
  const data = read()
  if (data.schedules.length === 0 && data.escalations.length === 0 && isDemoWorkspace()) {
    return demoData().schedules
  }
  return data.schedules
}

export function loadEscalations(): OncallEscalation[] {
  const data = read()
  if (data.schedules.length === 0 && data.escalations.length === 0 && isDemoWorkspace()) {
    return demoData().escalations
  }
  return data.escalations
}

export function saveSchedule(s: OncallSchedule) {
  const data = read()
  const normalized = {
    ...s,
    currentOnCall: s.currentOnCall ?? s.members[0]?.id,
    updatedAt: new Date().toISOString(),
  }
  const idx = data.schedules.findIndex(x => x.id === s.id)
  if (idx >= 0) data.schedules[idx] = normalized
  else data.schedules.push(normalized)
  write(data)
}

export function deleteSchedule(id: string) {
  const data = read()
  data.schedules = data.schedules.filter(s => s.id !== id)
  write(data)
}

export function rotateOnCall(scheduleId: string): OncallSchedule | null {
  const data = read()
  const idx = data.schedules.findIndex(s => s.id === scheduleId)
  if (idx < 0) return null
  const s = data.schedules[idx]
  if (s.members.length === 0) return s
  const currentIdx = s.members.findIndex(m => m.id === s.currentOnCall)
  const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % s.members.length
  const updated = {
    ...s,
    currentOnCall: s.members[nextIdx]?.id,
    updatedAt: new Date().toISOString(),
  }
  data.schedules[idx] = updated
  write(data)
  return updated
}

export function addEscalation(e: Omit<OncallEscalation, 'id' | 'at' | 'resolved'>): OncallEscalation {
  const data = read()
  const esc: OncallEscalation = {
    ...e,
    id: `esc-${crypto.randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    resolved: false,
  }
  data.escalations.unshift(esc)
  if (data.escalations.length > 1000) data.escalations.length = 1000
  write(data)
  return esc
}

export function resolveEscalation(id: string, by: string): OncallEscalation | null {
  const data = read()
  const idx = data.escalations.findIndex(e => e.id === id)
  if (idx < 0) return null
  const updated: OncallEscalation = {
    ...data.escalations[idx],
    resolved: true,
    resolvedAt: new Date().toISOString(),
    resolvedBy: by,
  }
  data.escalations[idx] = updated
  write(data)
  return updated
}

export function newScheduleId(): string { return `oncall-${crypto.randomUUID().slice(0, 8)}` }
