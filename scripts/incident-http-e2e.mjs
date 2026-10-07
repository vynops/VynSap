import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { SignJWT } from 'jose'

const project = process.cwd()
assert.ok(fs.existsSync(path.join(project, '.next', 'BUILD_ID')), 'Build the application before running HTTP verification')
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'vynsap-http-'))
const data = path.join(sandbox, 'data')
fs.mkdirSync(data)
const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value))
const read = (name, fallback = []) => { try { return JSON.parse(fs.readFileSync(path.join(data, `${name}.json`), 'utf8')) } catch { return fallback } }
const secret = randomBytes(32).toString('hex')
const users = ['admin', 'editor', 'viewer'].map(role => ({ id: `http-${role}`, name: `HTTP ${role}`, email: `${role}@example.invalid`, role, active: true, passwordHash: 'unused', createdAt: new Date().toISOString() }))
const tokens = Object.fromEntries(await Promise.all(users.map(async user => [user.role, await new SignJWT({ id: user.id, name: user.name, email: user.email, role: user.role }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secret))])))
const checks = []
const deliveries = []
let appUrl
let application
let stop
const stopped = new Promise(resolve => { stop = resolve })
const receiver = http.createServer(async (request, response) => {
  try {
    if (request.url === '/session') {
      response.writeHead(302, { 'Set-Cookie': `vs_token=${tokens.admin}; HttpOnly; SameSite=Lax; Path=/`, Location: `${appUrl}/incidents` })
      response.end()
    } else if (request.url === '/slack' && request.method === 'POST') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const message = JSON.parse(Buffer.concat(chunks).toString())
      assert.ok(message.blocks[0].text.text.length > 0)
      assert.ok(Array.from(message.blocks[0].text.text).length <= 150)
      assert.ok(message.blocks[1].text.text.length > 0)
      assert.ok(Array.from(message.blocks[1].text.text).length <= 3000)
      deliveries.push({ at: new Date().toISOString() })
      response.end('ok')
    } else if (request.url === '/evidence') {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ deliveries: deliveries.length, heartbeat: read('monitor-status', null), auditActions: [...new Set(read('audit').map(entry => entry.action))], checks }))
    } else if (request.url === '/stop') {
      response.end('stopping')
      stop()
    } else {
      response.writeHead(404).end()
    }
  } catch {
    response.writeHead(400).end('invalid test payload')
  }
})

async function eventually(predicate, label) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (predicate()) return
    await delay(100)
  }
  throw new Error(`Timed out: ${label}`)
}

try {
  for (const directory of ['.next', 'node_modules', 'public']) {
    if (fs.existsSync(path.join(project, directory))) fs.symlinkSync(path.join(project, directory), path.join(sandbox, directory), process.platform === 'win32' ? 'junction' : 'dir')
  }
  fs.writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify({ name: 'vynsap-verification', private: true }))
  write('users', users)
  write('incidents', [])
  write('audit', [])
  write('automation-rules', [])
  write('automation-runs', [])
  write('oncall', { schedules: [], escalations: [] })
  write('connections', [{ id: 'verification-source', name: 'Verification system', host: '127.0.0.1', port: 1, dbType: 'hana', tags: [], notes: '', passwordEnc: '', connectorType: 'odata', environment: 'test' }])
  receiver.listen(0, '127.0.0.1')
  await once(receiver, 'listening')
  const receiverUrl = `http://127.0.0.1:${receiver.address().port}`
  write('settings', { slackWebhook: `${receiverUrl}/slack`, monitorIntervalSec: 5, autoProposals: false })
  application = spawn(process.execPath, [path.join(project, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', sandbox, '--hostname', '127.0.0.1', '--port', '0'], {
    cwd: sandbox, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_TEST_CONTEXT: undefined, NODE_ENV: 'production', JWT_SECRET: secret, VYNSAP_MONITOR_ENABLED: 'true' },
  })
  let output = ''
  application.stdout.on('data', chunk => {
    output += chunk.toString()
    const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/)
    if (match && Number(match[1])) appUrl = match[0]
  })
  application.stderr.on('data', () => {})
  await eventually(() => appUrl && output.includes('Ready'), 'application readiness')
  await eventually(() => read('monitor-status', null)?.completedAt && deliveries.length > 0, 'browserless startup and automatic alert delivery')
  assert.equal(read('monitor-status', null).state, 'degraded')
  assert.ok(read('incidents').some(incident => incident.fingerprint === 'verification-source:monitor-unavailable' && incident.notification?.status === 'accepted'))
  checks.push('browserless automatic incident, accepted notification, and heartbeat')
  const api = (pathname, method = 'GET', body, role = 'admin') => fetch(`${appUrl}${pathname}`, {
    method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(role ? { Cookie: `vs_token=${tokens[role]}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  assert.equal((await api('/api/incidents', 'GET', undefined, null)).status, 401)
  assert.equal((await api('/api/incidents', 'POST', { title: 'Denied' }, 'viewer')).status, 403)
  for (const invalid of [null, [], {}, { title: '' }, { title: 'Invalid', severity: 'invalid' }]) assert.equal((await api('/api/incidents', 'POST', invalid, 'editor')).status, 400)
  const created = await api('/api/incidents', 'POST', { title: 'HTTP workflow incident', description: '', severity: 'high' }, 'editor')
  assert.equal(created.status, 201)
  const incident = await created.json()
  const incidentPath = `/api/incidents/${incident.id}`
  await eventually(() => read('incidents').find(item => item.id === incident.id)?.notification?.status === 'accepted', 'manual incident background notification')
  assert.equal((await api(incidentPath, 'DELETE')).status, 409)
  assert.equal((await api(incidentPath, 'PATCH', { timeline: [] }, 'editor')).status, 400)
  const malformed = await fetch(`${appUrl}${incidentPath}`, { method: 'PATCH', headers: { Cookie: `vs_token=${tokens.editor}`, 'Content-Type': 'application/json' }, body: '{' })
  assert.equal(malformed.status, 400)
  assert.equal((await api(incidentPath, 'PATCH', { status: 'investigating', assignee: 'HTTP responder' }, 'editor')).status, 200)
  assert.equal((await api(incidentPath, 'PATCH', { note: 'HTTP triage evidence' }, 'editor')).status, 200)
  checks.push('HTTP authentication, permissions, malformed input and protected incident history')
  for (const invalid of [null, { name: 'Invalid', members: [null] }, { name: 'Invalid', rotation: 'invalid' }]) assert.equal((await api('/api/oncall', 'POST', invalid, 'editor')).status, 400)
  const scheduleResponse = await api('/api/oncall', 'POST', { name: 'HTTP coverage', members: [{ id: 'first', name: 'First responder', email: 'first@example.invalid', timezone: 'UTC' }, { id: 'second', name: 'Second responder', email: 'second@example.invalid', timezone: 'UTC' }] }, 'editor')
  assert.equal(scheduleResponse.status, 201)
  const schedule = await scheduleResponse.json()
  const schedulePath = `/api/oncall/${schedule.id}`
  assert.equal((await api(schedulePath, 'PATCH', { action: 'rotate' }, 'editor')).status, 200)
  const escalated = await api(schedulePath, 'PATCH', { action: 'escalate', incidentId: incident.id, reason: 'HTTP escalation evidence' }, 'editor')
  assert.equal(escalated.status, 200)
  const escalation = await escalated.json()
  await eventually(() => read('oncall', {}).escalations?.find(item => item.id === escalation.id)?.notification?.status === 'accepted', 'background escalation delivery')
  assert.equal((await api(incidentPath, 'PATCH', { status: 'resolved' }, 'editor')).status, 200)
  await eventually(() => read('incidents').find(item => item.id === incident.id)?.notification?.status === 'accepted', 'resolution delivery without browser')
  const finalIncident = await (await api(incidentPath)).json()
  assert.ok(finalIncident.resolvedAt)
  assert.ok(finalIncident.timeline.some(entry => entry.note === 'HTTP triage evidence'))
  assert.ok(finalIncident.timeline.some(entry => entry.note.includes(escalation.id)))
  assert.equal((await api(incidentPath, 'DELETE')).status, 200)
  assert.equal((await api(incidentPath)).status, 404)
  assert.equal((await api(schedulePath, 'DELETE')).status, 200)
  checks.push('HTTP incident lifecycle, on-call rotation/escalation, background delivery and deletion')
  for (const action of ['create_incident', 'update_incident', 'add_note', 'delete_incident', 'create_schedule', 'rotate_schedule', 'escalate_schedule', 'delete_schedule', 'notification_delivery']) assert.ok(read('audit').some(entry => entry.action === action))
  assert.equal((await api('/api/audit')).status, 200)
  assert.equal((await api('/api/incidents?includeKpis=1')).status, 200)
  checks.push('persisted audit actions and incident KPI API')
  const beforeRead = deliveries.length
  for (const pathname of ['/incidents', '/oncall', '/audit', '/alerts', '/sla', '/automation']) assert.equal((await api(pathname)).status, 200)
  assert.equal((await api('/api/alerts')).status, 200)
  assert.equal(deliveries.length, beforeRead)
  checks.push('dashboard routes and read-only alerts endpoint')
  console.log(JSON.stringify({ result: 'passed', checks, deliveries: deliveries.length, realNotifications: 0, isolatedData: true, ...(process.argv.includes('--serve') ? { appUrl, sessionUrl: `${receiverUrl}/session`, evidenceUrl: `${receiverUrl}/evidence`, stopUrl: `${receiverUrl}/stop` } : {}) }, null, 2))
  if (process.argv.includes('--serve')) {
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    await stopped
  }
} finally {
  if (application && application.exitCode === null) {
    const closed = once(application, 'close')
    application.kill()
    await closed
  }
  receiver.closeAllConnections()
  if (receiver.listening) await new Promise(resolve => receiver.close(resolve))
  for (const directory of ['.next', 'node_modules', 'public']) {
    const link = path.join(sandbox, directory)
    if (fs.existsSync(link)) fs.unlinkSync(link)
  }
  fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}