import { SignJWT, jwtVerify } from 'jose'
import type { SessionUser } from './auth'
import { getRuntimeSecrets } from './runtime-secrets'

/** Edge-compatible token verification — no Node.js crypto */
export async function verifyTokenEdge(token: string): Promise<SessionUser | null> {
  try {
    const secret = new TextEncoder().encode(getRuntimeSecrets().jwtSecret)
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}
