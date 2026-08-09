import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isDemoWorkspace } from './connection-store'

const FILE = path.join(process.cwd(), 'data', 'copilot-history.json')

export interface CopilotHistoryEntry {
  id: string
  connId?: string
  connName?: string
  prompt: string
  reply: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  createdAt: string
}

interface CopilotHistoryData {
  entries: CopilotHistoryEntry[]
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
  data.entries.unshift(saved)
  if (data.entries.length > 100) data.entries.length = 100
  write(data)
  return saved
}

export function clearCopilotHistory() {
  write({ entries: [] })
}

export function getCopilotUsageSummary() {
  const entries = loadCopilotHistory()
  const totalPrompts = entries.length
  const promptTokens = entries.reduce((n, e) => n + e.promptTokens, 0)
  const completionTokens = entries.reduce((n, e) => n + e.completionTokens, 0)
  const totalTokens = entries.reduce((n, e) => n + e.totalTokens, 0)
  const last24h = entries.filter(e => Date.now() - new Date(e.createdAt).getTime() < 24 * 3600 * 1000)
  return {
    totalPrompts,
    promptTokens,
    completionTokens,
    totalTokens,
    prompts24h: last24h.length,
    avgTokensPerPrompt: totalPrompts > 0 ? Math.round(totalTokens / totalPrompts) : 0,
  }
}
