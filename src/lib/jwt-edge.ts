import { SignJWT, jwtVerify } from 'jose'
import type { SessionUser } from './auth'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'vynsap-dev-secret-change-in-production'
)

/** Edge-compatible token verification — no Node.js crypto */
export async function verifyTokenEdge(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}
