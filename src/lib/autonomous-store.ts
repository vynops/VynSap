import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isDemoWorkspace, loadConnections } from './connection-store'

const FILE = path.join(process.cwd(), 'data', 'autonomous-proposals.json')

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'
export type ProposalCategory = 'performance' | 'security' | 'capacity' | 'replication' | 'backup' | 'memory' | 'schema' | 'column_store'

export interface AutonomousProposal {
  id: string
  title: string
  description: string
  category: ProposalCategory
  impact: 'critical' | 'high' | 'medium' | 'low'
  effort: 'auto' | 'low' | 'medium' | 'high'
  status: ProposalStatus
  connectionId?: string
  connectionName?: string
  sql?: string
  expectedGain: string
  riskLevel: 'safe' | 'low' | 'medium' | 'high'
  aiReasoning: string
  approvedBy?: string
  appliedAt?: string
  createdAt: string
}

function read(): AutonomousProposal[] {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}
function write(list: AutonomousProposal[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
}

function demoProposals(): AutonomousProposal[] {
  const conn = loadConnections()[0]
  const now = Date.now()
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString()

  return [
    {
      id: 'prop-demo-1',
      title: 'Merge high-delta financial tables before peak load',
      description: 'BSEG and VBAP delta segments are growing faster than baseline and may affect report latency.',
      category: 'column_store',
      impact: 'high',
      effort: 'low',
      status: 'pending',
      connectionId: conn?.id,
      connectionName: conn?.name,
      sql: 'MERGE DELTA OF "SAPMANDT"."BSEG"; MERGE DELTA OF "SAPMANDT"."VBAP";',
      expectedGain: 'Reduce report latency by 18-25% during morning peak.',
      riskLevel: 'low',
      aiReasoning: 'Delta rows and unload events indicate accumulating merge debt on top reporting tables.',
      createdAt: iso(2),
    },
    {
      id: 'prop-demo-2',
      title: 'Tighten backup freshness guardrails',
      description: 'Operational policy indicates full backup window drift; recommend stricter automation threshold and escalation path.',
      category: 'backup',
      impact: 'medium',
      effort: 'low',
      status: 'approved',
      connectionId: conn?.id,
      connectionName: conn?.name,
      expectedGain: 'Improve backup SLA compliance and reduce alert fatigue.',
      riskLevel: 'safe',
      aiReasoning: 'Observed backup delays correlate with manual intervention and weak escalation timing.',
      approvedBy: 'Maria SRE',
      createdAt: iso(10),
    },
    {
      id: 'prop-demo-3',
      title: 'Raise plan-cache review cadence for reporting SQL',
      description: 'Expensive statement mix is dominated by reporting queries with repeatable patterns; monitoring cadence should be increased.',
      category: 'performance',
      impact: 'medium',
      effort: 'auto',
      status: 'applied',
      connectionId: conn?.id,
      connectionName: conn?.name,
      expectedGain: 'Earlier detection of CPU hotspots and regression candidates.',
      riskLevel: 'safe',
      aiReasoning: 'Large CPU concentration in a small group of recurring statements justifies higher review frequency.',
      approvedBy: 'Alex DBA',
      appliedAt: iso(18),
      createdAt: iso(24),
    },
    {
      id: 'prop-demo-4',
      title: 'Rebalance replication lag notification policy',
      description: 'HSR lag alerts are too sensitive during batch windows; recommend conditional buffering and delayed escalation.',
      category: 'replication',
      impact: 'high',
      effort: 'medium',
      status: 'failed',
      connectionId: conn?.id,
      connectionName: conn?.name,
      expectedGain: 'Reduce false-positive paging during batch replication bursts.',
      riskLevel: 'medium',
      aiReasoning: 'Current lag profile shows frequent short-lived spikes that do not threaten RPO.',
      approvedBy: 'Priya DBA',
      appliedAt: iso(36),
      createdAt: iso(40),
    },
  ]
}

export function loadProposals(): AutonomousProposal[] {
  const list = read()
  if (list.length === 0 && isDemoWorkspace()) return demoProposals()
  return list
}

export function saveProposal(p: AutonomousProposal) {
  const list = read()
  const idx = list.findIndex(x => x.id === p.id)
  if (idx >= 0) list[idx] = p
  else list.push(p)
  write(list)
}

export function deleteProposal(id: string) { write(read().filter(p => p.id !== id)) }
export function newProposalId(): string { return `prop-${crypto.randomUUID().slice(0, 8)}` }
