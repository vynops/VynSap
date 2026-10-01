const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000

interface LoginFailures {
  count: number
  firstFailureAt: number
}

const failures = new Map<string, LoginFailures>()

function activeFailures(key: string): LoginFailures | undefined {
  const entry = failures.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.firstFailureAt >= WINDOW_MS) {
    failures.delete(key)
    return undefined
  }
  return entry
}

export function loginAllowed(key: string): boolean {
  return (activeFailures(key)?.count ?? 0) < MAX_FAILURES
}

export function recordLoginFailure(key: string) {
  const entry = activeFailures(key)
  if (entry) {
    entry.count += 1
    return
  }
  failures.set(key, { count: 1, firstFailureAt: Date.now() })
}

export function clearLoginFailures(key: string) {
  failures.delete(key)
}