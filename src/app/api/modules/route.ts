import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadConnections } from '@/lib/connection-store'
import { getErpAppOverview, getModuleHealth } from '@/lib/erp-client'

const WORKFLOW_MAP: Record<string, string[]> = {
  FI: ['General Ledger Posting', 'Accounts Payable Clearing', 'Month-End Close'],
  MM: ['Purchase Requisition Flow', 'Goods Receipt Verification', 'Vendor Invoice Matching'],
  SD: ['Order Fulfillment', 'Delivery Confirmation', 'Billing and Invoicing'],
  PP: ['MRP Run', 'Production Order Release', 'Shop Floor Confirmation'],
  HCM: ['Payroll Run', 'Time Evaluation', 'Employee Master Synchronization'],
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth

  const conn = loadConnections()[0]
  if (!conn) {
    return NextResponse.json({ error: 'No ERP system connection configured' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const code = (searchParams.get('code') ?? '').toUpperCase()

  const [overview, modules] = await Promise.all([
    getErpAppOverview(conn),
    getModuleHealth(conn, code || undefined),
  ])

  const payload = modules.map(m => ({
    ...m,
    workflows: WORKFLOW_MAP[m.code] ?? [],
    openEvents: overview.events.filter(e => e.module === m.code),
  }))

  return NextResponse.json({
    generatedAt: overview.generatedAt,
    system: overview.system,
    modules: payload,
  })
}
