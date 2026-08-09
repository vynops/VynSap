import fs from 'fs'
import path from 'path'

const FILE = path.join(process.cwd(), 'data', 'telemetry.json')

export interface ConnectorLatencySample {
  connId: string
  connectorType: 'odata' | 'rfc' | 'bapi'
  latencyMs: number
  status: 'connected' | 'degraded' | 'failed'
  at: string
}

export interface AlertSnapshot {
  connId: string
  activeCount: number
  criticalCount: number
  warningCount: number
  at: string
}

export interface SloSnapshot {
  totalBudgetMin: number
  usedBudgetMin: number
  remainingBudgetMin: number
  at: string
}

export interface CapacitySnapshot {
  connId: string
  peakUsedPct: number
  at: string
}

interface TelemetryState {
  connectorLatency: ConnectorLatencySample[]
  alertSnapshots: AlertSnapshot[]
  sloSnapshots: SloSnapshot[]
  capacitySnapshots: CapacitySnapshot[]
}

function readState(): TelemetryState {
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<TelemetryState>
    return {
      connectorLatency: Array.isArray(parsed.connectorLatency) ? parsed.connectorLatency : [],
      alertSnapshots: Array.isArray(parsed.alertSnapshots) ? parsed.alertSnapshots : [],
      sloSnapshots: Array.isArray(parsed.sloSnapshots) ? parsed.sloSnapshots : [],
      capacitySnapshots: Array.isArray(parsed.capacitySnapshots) ? parsed.capacitySnapshots : [],
    }
  } catch {
    return {
      connectorLatency: [],
      alertSnapshots: [],
      sloSnapshots: [],
      capacitySnapshots: [],
    }
  }
}

function writeState(state: TelemetryState): void {
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8')
}

export function appendConnectorLatencySamples(samples: ConnectorLatencySample[]): void {
  if (samples.length === 0) return
  const state = readState()
  const merged = [...samples, ...state.connectorLatency]
  // Keep only the latest 5000 samples to prevent unbounded growth.
  state.connectorLatency = merged.slice(0, 5000)
  writeState(state)
}

export function appendAlertSnapshots(samples: AlertSnapshot[]): void {
  if (samples.length === 0) return
  const state = readState()
  state.alertSnapshots = [...samples, ...state.alertSnapshots].slice(0, 7000)
  writeState(state)
}

export function appendSloSnapshot(sample: SloSnapshot): void {
  const state = readState()
  state.sloSnapshots = [sample, ...state.sloSnapshots].slice(0, 5000)
  writeState(state)
}

export function appendCapacitySnapshots(samples: CapacitySnapshot[]): void {
  if (samples.length === 0) return
  const state = readState()
  state.capacitySnapshots = [...samples, ...state.capacitySnapshots].slice(0, 7000)
  writeState(state)
}

function parseTs(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

function latestTwo<T extends { at: string }>(items: T[]): [T | null, T | null] {
  if (items.length === 0) return [null, null]
  const sorted = [...items].sort((a, b) => parseTs(a.at) - parseTs(b.at))
  if (sorted.length === 1) return [sorted[0], sorted[0]]
  return [sorted[sorted.length - 2], sorted[sorted.length - 1]]
}

export function getAlertStats(connId: string, windowHours = 24): {
  sampleCount: number
  rawSignals: number
  avgActive: number
  avgCritical: number
} {
  const cutoff = Date.now() - windowHours * 3600 * 1000
  const state = readState()
  const window = state.alertSnapshots.filter(s => s.connId === connId && parseTs(s.at) >= cutoff)
  if (window.length === 0) {
    return { sampleCount: 0, rawSignals: 0, avgActive: 0, avgCritical: 0 }
  }
  const rawSignals = window.reduce((n, s) => n + Math.max(0, Number(s.activeCount) || 0), 0)
  const avgActive = rawSignals / window.length
  const avgCritical = window.reduce((n, s) => n + Math.max(0, Number(s.criticalCount) || 0), 0) / window.length
  return {
    sampleCount: window.length,
    rawSignals,
    avgActive: Number(avgActive.toFixed(2)),
    avgCritical: Number(avgCritical.toFixed(2)),
  }
}

export function getSloBurnRate(windowHours = 1): {
  burnRate: number
  usedPerHourMin: number
} {
  const cutoff = Date.now() - windowHours * 3600 * 1000
  const state = readState()
  const window = state.sloSnapshots.filter(s => parseTs(s.at) >= cutoff)
  const [prev, latest] = latestTwo(window)
  if (!prev || !latest) return { burnRate: 0, usedPerHourMin: 0 }

  const hours = Math.max(1 / 60, (parseTs(latest.at) - parseTs(prev.at)) / 3600000)
  const deltaUsed = Math.max(0, (latest.usedBudgetMin ?? 0) - (prev.usedBudgetMin ?? 0))
  const usedPerHourMin = deltaUsed / hours
  const budgetPerHour = (latest.totalBudgetMin ?? 0) / (30 * 24)
  const burnRate = budgetPerHour <= 0 ? 0 : usedPerHourMin / budgetPerHour
  return {
    burnRate: Number(burnRate.toFixed(2)),
    usedPerHourMin: Number(usedPerHourMin.toFixed(3)),
  }
}

export function getCapacityGrowth(connId: string, windowDays = 7): {
  sampleCount: number
  dailyGrowthPct: number | null
  latestPeakUsedPct: number | null
  daysToExhaustion: number | null
} {
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000
  const state = readState()
  const window = state.capacitySnapshots
    .filter(s => s.connId === connId && parseTs(s.at) >= cutoff)
    .sort((a, b) => parseTs(a.at) - parseTs(b.at))

  if (window.length === 0) {
    return { sampleCount: 0, dailyGrowthPct: null, latestPeakUsedPct: null, daysToExhaustion: null }
  }

  const first = window[0]
  const latest = window[window.length - 1]
  const elapsedDays = Math.max(1 / 24, (parseTs(latest.at) - parseTs(first.at)) / (24 * 3600000))
  const growth = (latest.peakUsedPct - first.peakUsedPct) / elapsedDays
  const dailyGrowthPct = growth > 0 ? Number(growth.toFixed(4)) : 0
  const latestPeakUsedPct = Number(latest.peakUsedPct.toFixed(2))
  const remaining = Math.max(0, 100 - latestPeakUsedPct)
  const daysToExhaustion = dailyGrowthPct > 0 ? Number((remaining / dailyGrowthPct).toFixed(1)) : null

  return {
    sampleCount: window.length,
    dailyGrowthPct,
    latestPeakUsedPct,
    daysToExhaustion,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function getConnectorLatencyStats(
  connId: string,
  connectorType: ConnectorLatencySample['connectorType'],
  windowHours = 24
): {
  count: number
  avgMs: number
  p95Ms: number
  p99Ms: number
} {
  const state = readState()
  const cutoff = Date.now() - windowHours * 3600 * 1000
  const values = state.connectorLatency
    .filter(s => s.connId === connId && s.connectorType === connectorType && new Date(s.at).getTime() >= cutoff)
    .map(s => Number(s.latencyMs))
    .filter(v => Number.isFinite(v) && v >= 0)

  if (values.length === 0) {
    return { count: 0, avgMs: 0, p95Ms: 0, p99Ms: 0 }
  }

  values.sort((a, b) => a - b)
  const avg = values.reduce((n, x) => n + x, 0) / values.length

  return {
    count: values.length,
    avgMs: Number(avg.toFixed(2)),
    p95Ms: Number(percentile(values, 95).toFixed(2)),
    p99Ms: Number(percentile(values, 99).toFixed(2)),
  }
}
