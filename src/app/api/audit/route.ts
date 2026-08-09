import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { loadAudit } from '@/lib/audit-store'

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, 'viewer')
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(Number(searchParams.get('limit')  ?? 200), 1000)
  const action = searchParams.get('action') as Parameters<typeof loadAudit>[1] | undefined
  const actor  = searchParams.get('actor') ?? undefined
  return NextResponse.json(loadAudit(limit, action, actor))
}
