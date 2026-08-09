import fs from 'fs';

async function run() {
  const base = 'http://localhost:3080';
  const report = {
    timestamp: new Date().toISOString(),
    base,
    login: null,
    pages: [],
    apis: [],
    summary: {},
  };

  const pages = [
    '/', '/overview', '/fi', '/mm', '/sd', '/pp', '/hcm', '/tenants', '/services',
    '/alerts', '/incidents', '/oncall', '/automation', '/autonomous', '/security',
    '/copilot', '/team', '/settings', '/sla', '/performance', '/memory', '/queries',
    '/slow-queries', '/schema', '/replication', '/backups', '/capacity', '/column-store',
  ];

  const apis = [
    '/api/erp-overview', '/api/modules?code=FI', '/api/modules?code=MM', '/api/modules?code=SD',
    '/api/modules?code=PP', '/api/modules?code=HCM', '/api/processes', '/api/overview',
    '/api/tenants', '/api/services', '/api/alerts', '/api/incidents', '/api/oncall',
    '/api/automation', '/api/autonomous', '/api/security', '/api/sla', '/api/performance',
    '/api/memory', '/api/queries', '/api/slow-queries', '/api/schema', '/api/replication',
    '/api/backups', '/api/capacity', '/api/column-store', '/api/team', '/api/settings', '/api/copilot',
  ];

  let loginRes;
  try {
    loginRes = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vynsap.local', password: 'admin123' }),
    });
  } catch (e) {
    report.fatal = 'server_unreachable';
    report.error = String(e);
    fs.writeFileSync('smoke-report.json', JSON.stringify(report, null, 2), 'utf8');
    return;
  }

  const setCookie = loginRes.headers.get('set-cookie') || '';
  const cookie = (setCookie.split(';')[0] || '').trim();
  report.login = { status: loginRes.status, cookie: Boolean(cookie) };

  for (const p of pages) {
    try {
      const r = await fetch(base + p, { headers: { cookie }, redirect: 'manual' });
      const t = await r.text();
      const noDataHint = /No\s+[A-Za-z ]+(data|connections|telemetry|events)/i.test(t);
      report.pages.push({
        path: p,
        status: r.status,
        redirect: r.headers.get('location') || null,
        htmlBytes: t.length,
        noDataHint,
      });
    } catch (e) {
      report.pages.push({ path: p, status: 0, error: String(e) });
    }
  }

  for (const p of apis) {
    try {
      const r = await fetch(base + p, { method: 'GET', headers: { cookie } });
      const ct = r.headers.get('content-type') || '';
      let shape = 'unknown';
      let count = null;
      let keys = [];

      if (ct.includes('application/json')) {
        const j = await r.json();
        if (Array.isArray(j)) {
          shape = 'array';
          count = j.length;
        } else if (j && typeof j === 'object') {
          shape = 'object';
          keys = Object.keys(j).slice(0, 8);
          if (Array.isArray(j.items)) count = j.items.length;
          if (Array.isArray(j.rules)) count = j.rules.length;
          if (Array.isArray(j.runs)) count = j.runs.length;
          if (Array.isArray(j.modules)) count = j.modules.length;
          if (Array.isArray(j.processes)) count = j.processes.length;
          if (Array.isArray(j.events)) count = j.events.length;
        }
      } else {
        await r.text();
        shape = 'non-json';
      }

      report.apis.push({ path: p, status: r.status, shape, count, keys });
    } catch (e) {
      report.apis.push({ path: p, status: 0, error: String(e) });
    }
  }

  const pageFail = report.pages.filter(x => x.status >= 400 || x.status === 0).length;
  const apiFail = report.apis.filter(x => x.status >= 400 || x.status === 0).length;
  report.summary = {
    pagesTotal: report.pages.length,
    pagesFailed: pageFail,
    apisTotal: report.apis.length,
    apisFailed: apiFail,
    pagesWithNoDataHint: report.pages.filter(x => x.noDataHint).length,
  };

  fs.writeFileSync('smoke-report.json', JSON.stringify(report, null, 2), 'utf8');
}

run();
