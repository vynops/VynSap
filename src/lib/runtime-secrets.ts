import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

interface RuntimeSecrets {
  jwtSecret: string
  connectionEncryptionKey: string
}

const secretsFile = path.join(process.cwd(), 'data', '.secrets.json')
let cachedSecrets: RuntimeSecrets | undefined

function readStoredSecrets(): RuntimeSecrets | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(secretsFile, 'utf8')) as Partial<RuntimeSecrets>
    if (typeof parsed.jwtSecret !== 'string' || typeof parsed.connectionEncryptionKey !== 'string') {
      throw new Error('Stored VynSAP secrets are invalid; restore the secrets file or configure secret overrides')
    }
    return { jwtSecret: parsed.jwtSecret, connectionEncryptionKey: parsed.connectionEncryptionKey }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function createStoredSecrets(secrets: RuntimeSecrets): RuntimeSecrets {
  fs.mkdirSync(path.dirname(secretsFile), { recursive: true })
  try {
    fs.writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    fs.chmodSync(secretsFile, 0o600)
    return secrets
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const stored = readStoredSecrets()
    if (!stored) throw new Error('VynSAP secret initialization failed')
    return stored
  }
}

export function getRuntimeSecrets(): RuntimeSecrets {
  if (cachedSecrets) return cachedSecrets

  const stored = readStoredSecrets()
  const configuredJwt = process.env.JWT_SECRET?.trim()
  const configuredConnectionKey = process.env.CONNECTION_ENCRYPTION_KEY?.trim()
  const generatedJwt = crypto.randomBytes(32).toString('base64url')
  const generatedConnectionKey = crypto.randomBytes(32).toString('base64url')
  const jwtSecret = configuredJwt || stored?.jwtSecret || generatedJwt
  const connectionEncryptionKey = configuredConnectionKey || stored?.connectionEncryptionKey || configuredJwt || generatedConnectionKey
  const resolved = { jwtSecret, connectionEncryptionKey }

  cachedSecrets = stored ? resolved : createStoredSecrets(resolved)
  return cachedSecrets
}
