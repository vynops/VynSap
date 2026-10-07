import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

test('isolated incident-management verification', async context => {
  const originalDirectory = process.env.VYNSAP_TEST_PROJECT_ROOT ?? process.cwd()
  const originalFetch = globalThis.fetch
  const sandbox = process.env.VYNSAP_TEST_SANDBOX ?? fs.mkdtempSync(path.join(os.tmpdir(), 'vynsap-incidents-'))
  if (!process.env.VYNSAP_TEST_SANDBOX) {
    fs.mkdirSync(path.join(sandbox, 'data'))
    try {
      const child = spawnSync(process.execPath, [path.join(originalDirectory, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--test', path.join(originalDirectory, 'scripts', 'incident-management.test.ts')], {
        cwd: sandbox, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, NODE_TEST_CONTEXT: undefined, VYNSAP_TEST_SANDBOX: sandbox, VYNSAP_TEST_PROJECT_ROOT: originalDirectory, TSX_TSCONFIG_PATH: path.join(originalDirectory, 'tsconfig.json') },
      })
      process.stdout.write(child.stdout ?? '')
      assert.equal(child.status, 0, child.stderr)
      assert.ok(fs.existsSync(path.join(sandbox, 'verification-complete.json')), 'Child workflow checks did not complete')
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
    return
  }
  try {
    const { saveSettings } = await import('../src/lib/settings-store')
    const { notify } = await import('../src/lib/notifications')
    const { loadAudit } = await import('../src/lib/audit-store')
    saveSettings({ slackWebhook: 'https://example.invalid/secret', teamsWebhook: 'https://example.invalid/teams' })
    let requests = 0
    globalThis.fetch = async () => {
      requests += 1
      return new Response('', { status: requests === 1 ? 503 : 200 })
    }
    const payload = { title: 'Test incident', body: 'Test evidence', severity: 'high' as const, source: 'test' }
    await assert.rejects(notify(payload), /1 configured channel/)
    assert.equal(requests, 2)
    const history = loadAudit()
    assert.equal(history.length, 2)
    assert.equal(history.filter(entry => entry.outcome === 'failure').length, 1)
    assert.equal(history.filter(entry => entry.outcome === 'success').length, 1)
    assert.ok(!JSON.stringify(history).includes('secret'))
    globalThis.fetch = async () => new Response('', { status: 200 })
    await notify(payload)
    assert.equal(loadAudit().length, 4)
    saveSettings({})
    await notify(payload)
    assert.equal(loadAudit().length, 4)

    const { loadIncidents, saveIncident } = await import('../src/lib/incident-store')
    const { processAlerts, runAlertMonitor, deliverPendingNotifications } = await import('../src/lib/alert-monitor')
    const { loadConnections } = await import('../src/lib/connection-store')
    const conn = { ...loadConnections()[0], id: 'test-system', name: 'Test system', host: '127.0.0.1', _isDemo: false, tags: [], notes: '', dbType: 'postgres' as const }
    const reset = () => {
      for (const file of ['incidents', 'audit']) fs.writeFileSync(path.join(sandbox, 'data', `${file}.json`), '[]')
      fs.writeFileSync(path.join(sandbox, 'data', 'connections.json'), JSON.stringify([conn]))
      saveSettings({ slackWebhook: 'https://example.invalid/slack', teamsWebhook: 'https://example.invalid/teams' })
    }
    const alert = { ALERT_ID: 'cpu', ALERT_RATING: 5, ALERT_DETAILS: 'CPU is 95%' }

    await context.test('deduplicates changing metrics and records incident and delivery history', async () => {
      reset()
      requests = 0
      globalThis.fetch = async () => { requests += 1; return new Response('', { status: 200 }) }
      await processAlerts(conn, [alert, alert])
      await processAlerts(conn, [{ ...alert, ALERT_DETAILS: 'CPU is 99%' }])
      assert.equal(loadIncidents().length, 1)
      assert.equal(requests, 2)
      assert.equal(loadIncidents()[0].notification?.status, 'accepted')
      assert.equal(loadAudit().filter(entry => entry.action === 'create_incident').length, 1)
      assert.equal(loadAudit().filter(entry => entry.action === 'notification_delivery').length, 2)
    })

    await context.test('persists bounded retries and does not resend successful channels', async () => {
      reset()
      const channels: string[] = []
      globalThis.fetch = async input => {
        const channel = String(input).endsWith('/slack') ? 'slack' : 'teams'
        channels.push(channel)
        return new Response('', { status: channel === 'teams' ? 503 : 200 })
      }
      await processAlerts(conn, [alert])
      assert.equal(loadIncidents()[0].notification?.status, 'failed')
      await processAlerts(conn, [alert])
      assert.equal(channels.length, 2)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const incident = loadIncidents()[0]
        incident.notification!.nextAttemptAt = new Date(0).toISOString()
        saveIncident(incident)
        await processAlerts(conn, [alert])
      }
      assert.deepEqual(channels, ['slack', 'teams', 'teams', 'teams'])
      assert.equal(loadIncidents()[0].notification?.attempts, 3)
    })

    await context.test('legacy alert fingerprints migrate without false recovery or duplicate incidents', async () => {
      reset()
      globalThis.fetch = async () => new Response('', { status: 200 })
      await processAlerts(conn, [alert])
      const legacy = loadIncidents()[0]
      legacy.fingerprint = `${legacy.fingerprint}:CPU is 95%`
      saveIncident(legacy)
      await processAlerts(conn, [{ ...alert, ALERT_DETAILS: 'CPU is 98%' }])
      assert.equal(loadIncidents().length, 1)
      assert.equal(loadIncidents()[0].fingerprint, 'test-system:cpu')
      assert.equal(loadIncidents()[0].evidence?.alertActive, true)
      assert.ok(!loadIncidents()[0].timeline.some(entry => entry.note.startsWith('Alert cleared')))
    })

    await context.test('an in-flight result cannot overwrite a newly queued lifecycle notification', async () => {
      reset()
      const { createIncident } = await import('../src/lib/incident-store')
      const { pendingNotification } = await import('../src/lib/notifications')
      const original = createIncident({ title: 'Concurrent update', description: 'Evidence', severity: 'high', status: 'open', tags: [], source: 'manual', notification: pendingNotification() })
      saveIncident(original)
      let release: () => void = () => {}
      let started: () => void = () => {}
      const sending = new Promise<void>(resolve => { started = resolve })
      const blocked = new Promise<void>(resolve => { release = resolve })
      globalThis.fetch = async () => { started(); await blocked; return new Response('', { status: 200 }) }
      const delivery = deliverPendingNotifications()
      await sending
      const changed = loadIncidents()[0]
      changed.status = 'resolved'
      changed.notification = pendingNotification()
      const newId = changed.notification.id
      saveIncident(changed)
      release()
      await delivery
      assert.equal(loadIncidents()[0].notification?.id, newId)
      assert.equal(loadIncidents()[0].notification?.status, 'pending')
      globalThis.fetch = async () => new Response('', { status: 200 })
      await deliverPendingNotifications()
      assert.equal(loadIncidents()[0].notification?.status, 'accepted')
    })

    await context.test('records recovery, does not reopen an ongoing acknowledged episode, and allows recurrence', async () => {
      reset()
      globalThis.fetch = async () => new Response('', { status: 200 })
      await processAlerts(conn, [alert])
      const incident = loadIncidents()[0]
      incident.status = 'resolved'
      saveIncident(incident)
      await processAlerts(conn, [alert])
      assert.equal(loadIncidents().length, 1)
      await processAlerts(conn, [])
      assert.equal(loadIncidents()[0].evidence?.alertActive, false)
      assert.match(loadIncidents()[0].timeline.at(-1)!.note, /Alert cleared/)
      await processAlerts(conn, [alert])
      assert.equal(loadIncidents().length, 2)
    })

    await context.test('missing channels are recorded as skipped, not delivered', async () => {
      reset()
      saveSettings({})
      globalThis.fetch = async () => { throw new Error('No outbound request expected') }
      await processAlerts(conn, [alert])
      assert.equal(loadIncidents()[0].notification?.status, 'skipped')
      assert.equal(loadAudit()[0].outcome, 'failure')
    })

    await context.test('severity escalation sends a fresh notification and cleared signals are resolved', async () => {
      reset()
      requests = 0
      globalThis.fetch = async () => { requests += 1; return new Response('', { status: 200 }) }
      await processAlerts(conn, [{ ...alert, ALERT_RATING: 3 }])
      await processAlerts(conn, [alert])
      assert.equal(loadIncidents().length, 1)
      assert.equal(loadIncidents()[0].severity, 'critical')
      assert.equal(requests, 4)
      await processAlerts(conn, [])
      const state = JSON.parse(fs.readFileSync(path.join(sandbox, 'data', 'apm.json'), 'utf8'))
      assert.equal(state.alertSignals.find((signal: { fingerprint: string }) => signal.fingerprint === 'test-system:cpu').status, 'resolved')
    })

    await context.test('source failures produce a degraded heartbeat without falsely clearing existing alerts', async () => {
      reset()
      globalThis.fetch = async () => new Response('', { status: 200 })
      await processAlerts(conn, [alert])
      const degraded = await runAlertMonitor(async () => { throw new Error('Unavailable') })
      assert.equal(degraded.state, 'degraded')
      assert.equal(degraded.failedConnections, 1)
      assert.equal(loadIncidents().find(item => item.fingerprint === 'test-system:cpu')?.evidence?.alertActive, true)
      assert.ok(loadIncidents().some(item => item.fingerprint === 'test-system:monitor-unavailable'))
      const recovered = await runAlertMonitor(async () => [])
      assert.equal(recovered.state, 'healthy')
      assert.ok(loadIncidents().every(item => item.evidence?.alertActive === false))
      const heartbeat = JSON.parse(fs.readFileSync(path.join(sandbox, 'data', 'monitor-status.json'), 'utf8'))
      assert.ok(heartbeat.completedAt)
    })

    await context.test('incident APIs enforce roles and preserve lifecycle audit history', async () => {
      reset()
      const { NextRequest } = await import('next/server')
      const { signToken } = await import('../src/lib/auth')
      const { saveUser } = await import('../src/lib/user-store')
      const collection = await import('../src/app/api/incidents/route')
      const item = await import('../src/app/api/incidents/[id]/route')
      const tokens: Record<string, string> = {}
      for (const role of ['admin', 'editor', 'viewer'] as const) {
        const user = { id: `test-${role}`, name: `Test ${role}`, email: `${role}@example.invalid`, role }
        saveUser({ ...user, passwordHash: 'unused', active: true, createdAt: new Date().toISOString() })
        tokens[role] = await signToken(user)
      }
      const request = (method: string, body?: object, role?: string) => new NextRequest('http://localhost/api/incidents', {
        method, headers: { 'Content-Type': 'application/json', ...(role ? { Cookie: `vs_token=${tokens[role]}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      assert.equal((await collection.GET(request('GET'))).status, 401)
      assert.equal((await collection.POST(request('POST', { title: 'Denied' }, 'viewer'))).status, 403)
      assert.equal((await collection.POST(request('POST', { title: '' }, 'editor'))).status, 400)
      assert.equal((await collection.POST(request('POST', { title: 'Bad severity', severity: 'invalid' }, 'editor'))).status, 400)
      const created = await collection.POST(request('POST', { title: 'Lifecycle test', severity: 'high' }, 'editor'))
      assert.equal(created.status, 201)
      const incident = await created.json()
      const ctx = { params: Promise.resolve({ id: incident.id }) }
      assert.equal((await item.GET(request('GET', undefined, 'viewer'), ctx)).status, 200)
      assert.equal((await item.DELETE(request('DELETE', undefined, 'editor'), ctx)).status, 403)
      assert.equal((await item.DELETE(request('DELETE', undefined, 'admin'), ctx)).status, 409)
      for (const fields of [{ id: 'overwritten' }, { timeline: [] }, { createdAt: 'overwritten' }, { status: 'invalid' }]) {
        assert.equal((await item.PATCH(request('PATCH', fields, 'editor'), ctx)).status, 400)
      }
      for (const fields of [{ status: 'investigating', assignee: 'Test responder' }, { note: 'Triage evidence recorded' }, { status: 'resolved' }, { status: 'open' }, { status: 'closed' }]) {
        assert.equal((await item.PATCH(request('PATCH', fields, 'editor'), ctx)).status, 200)
      }
      const persisted = loadIncidents()[0]
      assert.equal(persisted.id, incident.id)
      assert.equal(persisted.createdAt, incident.createdAt)
      assert.ok(persisted.resolvedAt)
      assert.ok(persisted.timeline.some(entry => entry.note === 'Triage evidence recorded'))
      assert.equal((await item.DELETE(request('DELETE', undefined, 'admin'), ctx)).status, 200)
      assert.equal(loadIncidents().length, 0)
      const actions = loadAudit().map(entry => entry.action)
      for (const action of ['create_incident', 'update_incident', 'add_note', 'delete_incident']) assert.ok(actions.includes(action as typeof actions[number]))
      assert.equal((await item.GET(request('GET', undefined, 'viewer'), ctx)).status, 404)
    })

    await context.test('strict telemetry rejects unsupported adapters instead of reporting healthy data', async () => {
      const { queryErp } = await import('../src/lib/erp-client')
      await assert.rejects(queryErp({ ...conn, dbType: 'hana' }, 'SELECT 1', undefined, { throwOnError: true }), /No supported telemetry adapter/)
    })

    await context.test('existing sessions immediately respect role changes and account deactivation', async () => {
      const { NextRequest } = await import('next/server')
      const { signToken } = await import('../src/lib/auth')
      const { saveUser } = await import('../src/lib/user-store')
      const { requireRole } = await import('../src/lib/auth')
      const user = { id: 'permission-test', name: 'Permission test', email: 'permission@example.invalid', role: 'admin' as const, active: true, passwordHash: 'unused', createdAt: new Date().toISOString() }
      saveUser(user)
      const token = await signToken(user)
      const request = new NextRequest('http://localhost/api/incidents', { headers: { Cookie: `vs_token=${token}` } })
      saveUser({ ...user, role: 'viewer' })
      const demoted = await requireRole(request, 'admin')
      assert.ok('status' in demoted)
      assert.equal(demoted.status, 403)
      saveUser({ ...user, active: false })
      const deactivated = await requireRole(request, 'viewer')
      assert.ok('status' in deactivated)
      assert.equal(deactivated.status, 403)
    })

    await context.test('email and custom webhook delivery record acceptance and rejection', async () => {
      reset()
      const mailer = (await import('nodemailer')).default
      const createTransport = mailer.createTransport
      try {
        let rejected = false
        mailer.createTransport = (() => ({ sendMail: async () => ({ accepted: rejected ? [] : ['alerts@example.invalid'], rejected: rejected ? ['alerts@example.invalid'] : [] }) })) as unknown as typeof createTransport
        saveSettings({ smtpHost: 'smtp.example.invalid', alertEmail: 'alerts@example.invalid', customWebhook: 'https://example.invalid/hook' })
        globalThis.fetch = async () => new Response('', { status: 200 })
        assert.deepEqual(await notify(payload), ['email', 'webhook'])
        rejected = true
        await assert.rejects(notify(payload), /1 configured channel/)
        assert.equal(loadAudit().filter(entry => entry.outcome === 'failure').length, 1)
      } finally {
        mailer.createTransport = createTransport
      }
    })

    await context.test('Slack payloads support empty descriptions and respect provider text limits', async () => {
      reset()
      saveSettings({ slackWebhook: 'https://example.invalid/slack' })
      const posted: { blocks: { text?: { text: string } }[] }[] = []
      globalThis.fetch = async (_, options) => { posted.push(JSON.parse(String(options?.body))); return new Response('', { status: 200 }) }
      await notify({ ...payload, body: '' })
      await notify({ ...payload, title: 'Title'.repeat(100), body: 'Body'.repeat(2000) })
      for (const message of posted) {
        assert.ok(message.blocks[1].text!.text.length > 0)
        assert.ok(Array.from(message.blocks[0].text!.text).length <= 150)
        assert.ok(Array.from(message.blocks[1].text!.text).length <= 3000)
      }
    })

    await context.test('manual lifecycle notifications are delivered by the background queue', async () => {
      reset()
      const { createIncident } = await import('../src/lib/incident-store')
      const incident = createIncident({ title: 'Manual incident', description: 'Evidence', severity: 'high', status: 'open', tags: [], source: 'manual', notification: { status: 'pending', attempts: 0, acceptedChannels: [] } })
      saveIncident(incident)
      requests = 0
      globalThis.fetch = async () => { requests += 1; return new Response('', { status: 200 }) }
      await deliverPendingNotifications()
      assert.equal(loadIncidents()[0].notification?.status, 'accepted')
      assert.equal(requests, 2)
      const resolved = loadIncidents()[0]
      resolved.status = 'resolved'
      resolved.notification = { status: 'pending', attempts: 0, acceptedChannels: [] }
      saveIncident(resolved)
      await deliverPendingNotifications()
      assert.equal(requests, 4)
      assert.equal(loadIncidents()[0].notification?.status, 'accepted')
    })

    await context.test('on-call creation, rotation, escalation, delivery and deletion preserve history', async () => {
      reset()
      fs.writeFileSync(path.join(sandbox, 'data', 'oncall.json'), JSON.stringify({ schedules: [], escalations: [] }))
      const { NextRequest } = await import('next/server')
      const { signToken } = await import('../src/lib/auth')
      const { loadEscalations } = await import('../src/lib/oncall-store')
      const collection = await import('../src/app/api/oncall/route')
      const item = await import('../src/app/api/oncall/[id]/route')
      const token = await signToken({ id: 'test-admin', name: 'Test admin', email: 'admin@example.invalid', role: 'admin' })
      const request = (method: string, body?: object) => new NextRequest('http://localhost/api/oncall', { method, headers: { 'Content-Type': 'application/json', Cookie: `vs_token=${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const members = [{ id: 'responder-1', name: 'First responder', email: 'first@example.invalid', timezone: 'UTC' }, { id: 'responder-2', name: 'Second responder', email: 'second@example.invalid', timezone: 'UTC' }]
      const created = await collection.POST(request('POST', { name: 'Test coverage', members }))
      assert.equal(created.status, 201)
      const schedule = await created.json()
      const ctx = { params: Promise.resolve({ id: schedule.id }) }
      const rotated = await item.PATCH(request('PATCH', { action: 'rotate' }), ctx)
      assert.equal((await rotated.json()).currentOnCall, 'responder-2')
      assert.equal((await item.PATCH(request('PATCH', { action: 'escalate', incidentId: 'missing' }), ctx)).status, 404)
      const response = await item.PATCH(request('PATCH', { action: 'escalate', reason: 'Respond to incident' }), ctx)
      assert.equal(response.status, 200)
      assert.equal((await response.json()).notification.status, 'pending')
      const mailer = (await import('nodemailer')).default
      const createTransport = mailer.createTransport
      try {
        let recipient = ''
        mailer.createTransport = (() => ({ sendMail: async (message: { to: string }) => { recipient = message.to; return { accepted: [message.to], rejected: [] } } })) as unknown as typeof createTransport
        saveSettings({ smtpHost: 'smtp.example.invalid' })
        await deliverPendingNotifications()
        assert.equal(recipient, 'second@example.invalid')
        assert.equal(loadEscalations()[0].notification?.status, 'accepted')
      } finally {
        mailer.createTransport = createTransport
      }
      assert.equal((await item.PATCH(request('PATCH', { name: 'Updated coverage' }), ctx)).status, 200)
      assert.equal((await item.PATCH(request('PATCH', { id: 'overwrite' }), ctx)).status, 400)
      assert.equal((await item.DELETE(request('DELETE'), ctx)).status, 200)
      assert.equal(loadEscalations().length, 1)
      const actions = loadAudit().map(entry => entry.action)
      for (const action of ['create_schedule', 'update_schedule', 'rotate_schedule', 'escalate_schedule', 'delete_schedule', 'notification_delivery']) assert.ok(actions.includes(action as typeof actions[number]))
    })

    await context.test('instrumentation starts monitoring in a separate server process without a browser', () => {
      reset()
      saveSettings({ autoProposals: false })
      fs.writeFileSync(path.join(sandbox, 'data', 'connections.json'), '[]')
      fs.writeFileSync(path.join(sandbox, 'data', 'automation-rules.json'), '[]')
      fs.rmSync(path.join(sandbox, 'data', 'monitor-status.json'), { force: true })
      const instrumentation = pathToFileURL(path.join(originalDirectory, 'src', 'instrumentation.ts')).href
      const code = `process.env.NEXT_RUNTIME='nodejs'; import(${JSON.stringify(instrumentation)}).then(async module => { const register = module.register ?? module.default?.register; if (typeof register !== 'function') throw new Error('Instrumentation register export unavailable'); await register(); const fs = await import('node:fs'); const status=JSON.parse(fs.readFileSync('data/monitor-status.json','utf8')); process.exit(status.state==='no-data-sources' && status.completedAt ? 0 : 1) }).catch(error => { console.error(error.name + ': ' + error.message); process.exit(1) })`
      const child = spawnSync(process.execPath, [path.join(originalDirectory, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--eval', code], {
        cwd: sandbox, encoding: 'utf8', timeout: 15000, env: { ...process.env, VYNSAP_MONITOR_ENABLED: 'true', TSX_TSCONFIG_PATH: path.join(originalDirectory, 'tsconfig.json') },
      })
      assert.equal(child.status, 0, child.stderr)
    })
    await context.test('audit corruption fails closed rather than discarding stored history', async () => {
      const { appendAudit } = await import('../src/lib/audit-store')
      const file = path.join(sandbox, 'data', 'audit.json')
      fs.writeFileSync(file, '{invalid')
      assert.throws(() => appendAudit({ actor: 'test', actorRole: 'system', action: 'create_incident', resource: 'incident', outcome: 'success' }))
      assert.equal(fs.readFileSync(file, 'utf8'), '{invalid')
    })
    await context.test('incident and on-call corruption cannot silently overwrite existing history', async () => {
      const { createIncident } = await import('../src/lib/incident-store')
      const { saveSchedule } = await import('../src/lib/oncall-store')
      const incidentFile = path.join(sandbox, 'data', 'incidents.json')
      const oncallFile = path.join(sandbox, 'data', 'oncall.json')
      fs.writeFileSync(incidentFile, '{invalid')
      fs.writeFileSync(oncallFile, '{invalid')
      assert.throws(() => saveIncident(createIncident({ title: 'Must not overwrite', description: '', severity: 'high', status: 'open', tags: [] })))
      assert.throws(() => saveSchedule({ id: 'must-not-overwrite', name: 'Test', rotation: 'weekly', members: [], escalation: [], createdAt: new Date().toISOString() }))
      assert.equal(fs.readFileSync(incidentFile, 'utf8'), '{invalid')
      assert.equal(fs.readFileSync(oncallFile, 'utf8'), '{invalid')
    })
    fs.writeFileSync(path.join(sandbox, 'verification-complete.json'), JSON.stringify({ completed: true }))
  } finally {
    globalThis.fetch = originalFetch
  }
})