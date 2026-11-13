/** Read-only guard for the SQL console: one SELECT/WITH statement, no row locking or SELECT INTO. */
export function validateReadOnlySql(sql: string): string | null {
  const stripped = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:[^']|'')*'/g, "''").trim()
  if (!/^(SELECT|WITH)\b/i.test(stripped)) return 'Only read-only SELECT statements are allowed.'
  if (/;\s*\S/.test(stripped)) return 'Run one statement at a time.'
  if (/\bFOR\s+UPDATE\b/i.test(stripped) || /\bINTO\b/i.test(stripped)) return 'Locking and SELECT INTO are not allowed.'
  return null
}
