import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const session = await requireRole(req, "viewer")
  if (session instanceof NextResponse) return session
  return NextResponse.json(session)
}
