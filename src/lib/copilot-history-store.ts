import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isDemoWorkspace } from './connection-store'

const FILE = path.join(process.cwd(), 'data', 'copilot-history.json')

export interface CopilotHistoryEntry {
  id: string
  connId?: string
  connName?: string
  provider?: string
  model?: string
  prompt: string
  reply: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  createdAt: string
}

interface CopilotHistoryData {
  entries: CopilotHistoryEntry[]
  lifetimeUsage?: {
    totalPrompts: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  usageEvents?: Array<Pick<CopilotHistoryEntry, 'provider' | 'model' | 'promptTokens' | 'completionTokens' | 'totalTokens' | 'createdAt'>>
}

function read(): CopilotHistoryData {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return { entries: [] }
  }
}

function write(data: CopilotHistoryData) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
}

function iso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
}

function demoEntries(): CopilotHistoryEntry[] {
  return [
    {
      id: 'cop-demo-1',
      connId: 'demo-erp-lab',
      connName: 'VynSAP Demo Lab',
      prompt: 'What are the top memory consumers in my column store?',
      reply: 'The largest consumers are BSEG, VBAP, and BKPF. Focus first on delta growth in BSEG and unload behavior in BALDAT.',
      promptTokens: 64,
      completionTokens: 52,
      totalTokens: 116,
      createdAt: iso(5),
    },
    {
      id: 'cop-demo-2',
      connId: 'demo-erp-lab',
      connName: 'VynSAP Demo Lab',
      prompt: 'Write a SQL to find expensive queries in the last hour.',
      reply: 'Use M_SQL_PLAN_CACHE filtered by LAST_EXECUTION_TIMESTAMP and order by TOTAL_EXECUTION_TIME DESC.',
      promptTokens: 71,
      completionTokens: 67,
      totalTokens: 138,
      createdAt: iso(2),
    },
  ]
}

export function loadCopilotHistory(): CopilotHistoryEntry[] {
  const data = read()
  if (data.entries.length === 0 && isDemoWorkspace()) return demoEntries()
  return data.entries
}

export function addCopilotHistoryEntry(entry: Omit<CopilotHistoryEntry, 'id' | 'createdAt'>): CopilotHistoryEntry {
  const data = read()
  const saved: CopilotHistoryEntry = {
    ...entry,
    id: `cop-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  }
  const entries = loadCopilotHistory()
  const lifetimeUsage = data.lifetimeUsage ?? entries.reduce((usage, item) => ({
    totalPrompts: usage.totalPrompts + 1,
    promptTokens: usage.promptTokens + item.promptTokens,
    completionTokens: usage.completionTokens + item.completionTokens,
    totalTokens: usage.totalTokens + item.totalTokens,
  }), { totalPrompts: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  data.lifetimeUsage = {
    totalPrompts: lifetimeUsage.totalPrompts + 1,
    promptTokens: lifetimeUsage.promptTokens + saved.promptTokens,
    completionTokens: lifetimeUsage.completionTokens + saved.completionTokens,
    totalTokens: lifetimeUsage.totalTokens + saved.totalTokens,
  }
  const today = new Date(saved.createdAt)
  today.setUTCHours(0, 0, 0, 0)
  today.setUTCDate(today.getUTCDate() - 6)
  const usageEvents = data.usageEvents ?? entries.map(({ provider, model, promptTokens, completionTokens, totalTokens, createdAt }) => ({
    provider, model, promptTokens, completionTokens, totalTokens, createdAt,
  }))
  data.usageEvents = [...usageEvents.filter(event => new Date(event.createdAt).getTime() >= today.getTime()), {
    provider: saved.provider,
    model: saved.model,
    promptTokens: saved.promptTokens,
    completionTokens: saved.completionTokens,
    totalTokens: saved.totalTokens,
    createdAt: saved.createdAt,
  }]
  data.entries.unshift(saved)
  if (data.entries.length > 100) data.entries.length = 100
  write(data)
  return saved
}

export function clearCopilotHistory() {
  const data = read()
  const entries = loadCopilotHistory()
  if (!data.lifetimeUsage) {
    data.lifetimeUsage = entries.reduce((usage, item) => ({
      totalPrompts: usage.totalPrompts + 1,
      promptTokens: usage.promptTokens + item.promptTokens,
      completionTokens: usage.completionTokens + item.completionTokens,
      totalTokens: usage.totalTokens + item.totalTokens,
    }), { totalPrompts: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  }
  if (!data.usageEvents) {
    data.usageEvents = entries.map(({ provider, model, promptTokens, completionTokens, totalTokens, createdAt }) => ({
      provider, model, promptTokens, completionTokens, totalTokens, createdAt,
    }))
  }
  data.entries = []
  write(data)
}

export function getCopilotUsageSummary() {
  const data = read()
  const entries = loadCopilotHistory()
  const lifetimeUsage = data.lifetimeUsage ?? entries.reduce((usage, item) => ({
    totalPrompts: usage.totalPrompts + 1,
    promptTokens: usage.promptTokens + item.promptTokens,
    completionTokens: usage.completionTokens + item.completionTokens,
    totalTokens: usage.totalTokens + item.totalTokens,
  }), { totalPrompts: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  const usageEvents = data.usageEvents ?? entries.map(({ provider, model, promptTokens, completionTokens, totalTokens, createdAt }) => ({
    provider, model, promptTokens, completionTokens, totalTokens, createdAt,
  }))
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6))
  const recentEvents = usageEvents.filter(event => event.createdAt.slice(0, 10) >= firstDay.toISOString().slice(0, 10) && event.createdAt.slice(0, 10) <= today)
  const todayEvents = recentEvents.filter(event => event.createdAt.slice(0, 10) === today)
  const byModel = new Map<string, {
    date: string
    provider: string
    model: string
    requests: number
    totalTokens: number
  }>()
  const providerLabels: Record<string, string> = {
    groq: 'Groq',
    openai: 'OpenAI',
    anthropic: 'Anthropic (Claude)',
    google: 'Google (Gemini)',
    custom: 'Custom / Self-Hosted',
  }
  for (const event of recentEvents) {
    const date = event.createdAt.slice(0, 10)
    const provider = event.provider
      ? providerLabels[event.provider] ?? event.provider
      : 'Unattributed (older usage)'
    const model = event.model ?? ''
    const key = `${date}\0${provider}\0${model}`
    const current = byModel.get(key) ?? { date, provider, model, requests: 0, totalTokens: 0 }
    current.requests += 1
    current.totalTokens += event.totalTokens
    byModel.set(key, current)
  }
  return {
    ...lifetimeUsage,
    prompts24h: usageEvents.filter(event => now.getTime() - new Date(event.createdAt).getTime() < 24 * 3600 * 1000).length,
    avgTokensPerPrompt: lifetimeUsage.totalPrompts > 0 ? Math.round(lifetimeUsage.totalTokens / lifetimeUsage.totalPrompts) : 0,
    today: {
      requests: todayEvents.length,
      promptTokens: todayEvents.reduce((total, event) => total + event.promptTokens, 0),
      completionTokens: todayEvents.reduce((total, event) => total + event.completionTokens, 0),
      totalTokens: todayEvents.reduce((total, event) => total + event.totalTokens, 0),
    },
    last7DaysByModel: [...byModel.values()].sort((a, b) => b.date.localeCompare(a.date) || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)),
  }
}
