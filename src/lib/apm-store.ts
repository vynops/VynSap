import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'apm.json')

export interface AlertSignal {
  fingerprint: string
  connectionId: string
  connectionName: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string
  source: string
  firstSeen: string
  lastSeen: string
  status: 'firing' | 'resolved'
}

interface ApmState {
  alertSignals: AlertSignal[]
}

function read(): ApmState {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<ApmState>
    return { alertSignals: Array.isArray(parsed.alertSignals) ? parsed.alertSignals : [] }
  } catch {
    return { alertSignals: [] }
  }
}

function write(state: ApmState): void {
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8')
}

export function recordAlertSignals(signals: AlertSignal[]): void {
  if (signals.length === 0) return
  const state = read()
  const byFingerprint = new Map(state.alertSignals.map(signal => [signal.fingerprint, signal]))
  for (const signal of signals) {
    const existing = byFingerprint.get(signal.fingerprint)
    byFingerprint.set(signal.fingerprint, {
      ...existing,
      ...signal,
      firstSeen: existing?.firstSeen ?? signal.firstSeen,
      lastSeen: signal.lastSeen,
    })
  }
  state.alertSignals = Array.from(byFingerprint.values())
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .slice(0, 10000)
  write(state)
}
