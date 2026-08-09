import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const FILE = path.join(process.cwd(), 'data', 'backup-schedules.json')

export type BackupType = 'complete' | 'incremental' | 'differential' | 'log' | 'data_snapshot'

export interface BackupSchedule {
  id: string
  connectionId: string
  connectionName: string
  type: BackupType
  destination: string       // file path or backint param
  prefix: string
  cronExpr: string
  enabled: boolean
  retentionDays: number
  withCatalog: boolean
  lastRun?: string
  nextRun?: string
  createdAt: string
}

function read(): BackupSchedule[] {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}
function write(list: BackupSchedule[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
}

export function loadSchedules(): BackupSchedule[] { return read() }

export function saveSchedule(s: BackupSchedule) {
  const list = read()
  const idx = list.findIndex(x => x.id === s.id)
  if (idx >= 0) list[idx] = s
  else list.push(s)
  write(list)
}

export function deleteSchedule(id: string) { write(read().filter(s => s.id !== id)) }
export function newScheduleId(): string { return `sched-${crypto.randomUUID().slice(0, 8)}` }
