import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'settings.json')

export interface AppSettings {
  alertEmail?: string
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPass?: string
  slackWebhook?: string
  teamsWebhook?: string
  groqApiKey?: string
  aiModel?: string
  defaultRefreshSec?: number
  slaTargetUptimePct?: number
  monitorIntervalSec?: number
  maxExpensiveStatements?: number
  alertThresholdCpuPct?: number
  alertThresholdMemPct?: number
  alertThresholdDiskPct?: number
  alertThresholdReplicationLagSec?: number
  autoProposals?: boolean
}

function read(): AppSettings {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} }
}
function write(s: AppSettings) {
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf8')
}

export function loadSettings(): AppSettings { return read() }
export function saveSettings(s: AppSettings) { write(s) }
export function mergeSettings(partial: Partial<AppSettings>) {
  write({ ...read(), ...partial })
}
