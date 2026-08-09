# VynSAP Agent Notes

## Product Snapshot
- VynSAP is a Next.js 16 SAP ERP operations platform running locally on port 3070.
- App Router pages live under `src/app/(dashboard)` and APIs under `src/app/api`.
- Auth uses the `vs_token` cookie with middleware protection.
- Runtime port is pinned to 3070 in `package.json` (`dev` and `start`) and in `ecosystem.config.js` for PM2.

## Demo Mode
- Demo detection is centralized in `src/lib/connection-store.ts`.
- `isDemoConnection()` classifies demo/sample connections.
- `isDemoWorkspace()` returns true when there are no real ERP connections.
- If `data/connections.json` is empty, a synthetic demo ERP connection is injected automatically.
- When a real ERP connection exists, demo-only injection stops.
- Demo banner is rendered in the dashboard layout and should disappear automatically once a real connection exists.

## Demo Data Coverage
### ERP-backed telemetry pages
These are powered by `src/lib/mock-erp.ts` in demo mode:
- overview
- tenants
- performance
- alerts
- memory
- column-store
- queries
- slow-queries
- services
- schema
- security
- backups
- capacity
- replication

### App-driven workflow pages
These auto-seed sample records when the workspace is demo-only:
- incidents: `src/lib/incident-store.ts`
- on-call: `src/lib/oncall-store.ts`
- automation: `src/lib/automation-store.ts`
- autonomous ops: `src/lib/autonomous-store.ts`

Automation note:
- `src/lib/automation-store.ts` performs demo top-up merges by id, so missing demo rules/runs are re-added even when data files are partially populated.

## Settings Integrations
- Settings page supports active integration tests for Groq, Email/SMTP, Slack webhook, and Teams webhook.
- Test endpoint: `POST /api/settings/test` (admin role required).
- Masked secrets (`***`) are never persisted over real secrets during tests.
- AI model selection is available in Settings via `aiModel`.
- Copilot runtime model resolves in this order: settings `aiModel` -> env `GROQ_MODEL` -> default `llama-3.3-70b-versatile`.

## Typography Baseline
- Global header title: `text-base font-semibold text-white`.
- Dashboard page primary title: `text-base font-semibold text-white`.
- Dashboard subtitle line: `text-sm text-slate-400 mt-0.5`.
- Keep this baseline unless user requests a design change.

## Implemented Operational Upgrades
### Incidents
- KPI cards for open/investigating/critical/avg resolve time.
- Create with system assignment.
- Add notes.
- Delete resolved/closed incidents.

### On-Call
- KPI cards and operational pulse.
- Create schedule.
- Rotate current responder.
- Escalate schedule.
- Delete schedule.
- Escalation event timeline.

### SLA
- Summary metrics for tracked systems, breaches, global uptime, avg MTTR.
- Per-system error budget remaining.
- Per-system MTTR and downtime.

### Automation
- KPI cards for enabled rules, runs, success rate, failures.
- Create rule.
- Enable/disable rule.
- Run-now execution.
- Delete rule.
- Execution run history.

### Autonomous Ops
- KPI cards for pending/approved/applied/failed/high-impact proposals.
- Generate proposals.
- Approve/reject/apply/delete flows.
- Apply requires approval first.
- Apply is admin-gated.
- Error surface for failed actions.

## Remaining Strategic Gaps
These are still the main areas if pushing toward top-tier APM parity:
- alert lifecycle engine: ack, snooze, dedupe, maintenance windows, ownership
- outbound notification integrations: PagerDuty, Opsgenie, Slack, Teams, email delivery state
- historical trend storage and anomaly baselines across pages
- unified audit trail across incident/on-call/automation/autonomous actions
- real ERP HSR two-node lab for true replication realism

## Lab Guidance
- A single real ERP node is enough for most pages.
- Replication/HSR realism needs two real ERP nodes.
- Do not rely on a small shared Docker host with heavy existing DB/k3s workloads for real ERP.
- Prefer a dedicated ERP VM or external sandbox for live telemetry.

## Working Conventions
- Keep demo mode automatic and non-invasive.
- Do not persist synthetic demo connection records to `data/connections.json`.
- Prefer repo memory for ongoing agent continuity, and use this file as a human-readable local handoff.
