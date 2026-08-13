<div align="center">

# VynSAP

### SAP ERP Operations Platform

**Self-hosted · Open Source · Enterprise Ready**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Live Demo](https://img.shields.io/badge/Live_Demo-sap.vynops.online-e11d48)](https://sap.vynops.online)

*Monitor. Operate. Govern. Your SAP ERP landscape from one intelligent dashboard.*

</div>

---

## Overview

VynSAP is a production-grade, self-hosted operations platform for SAP ERP environments. It surfaces real-time process health, module telemetry, connector status, transport governance, and SLA compliance for the teams who keep SAP landscapes running — without requiring SAP Solution Manager or a dedicated Basis team glued to transaction codes.

Built on **Next.js 16 App Router**, VynSAP connects to SAP systems via OData, RFC, and BAPI connectors and layers an AI reasoning engine on top for incident management, automation, and autonomous remediation proposals.

> **Design philosophy:** VynSAP does not replace your SAP Basis tooling. It sits on top of your ERP estate and adds operational intelligence, AI-assisted diagnostics, and a modern workflow layer for the entire ops team.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Demo Mode](#demo-mode)
- [Requirements](#requirements)
- [Installation](#installation)
  - [Local Development](#local-development)
  - [Production with PM2](#production-with-pm2)
- [Configuration](#configuration)
- [Connecting an ERP System](#connecting-an-erp-system)
- [SAP Modules](#sap-modules)
- [Operations](#operations)
- [AI Copilot](#ai-copilot)
- [Autonomous Ops](#autonomous-ops)
- [Transport Governance](#transport-governance)
- [Security & Audit](#security--audit)
- [Notifications](#notifications)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### 🔭 ERP System Monitoring
- **Connector health** — OData, RFC, and BAPI connector status with per-connection health scores
- **ERP systems view** — Multi-tenant/multi-SID landscape with availability, lag, and performance per system
- **Process monitoring** — SAP background job and interface process success/failure/backlog with 24-hour trend charts
- **SLO tracking** — Service-level objective monitoring across configured processes
- **Data freshness** — Average replication/interface lag across all connections

### 🏗️ SAP Module Telemetry
Per-module dashboards for the five core SAP functional areas:

| Module | Full Name | Key Metrics |
|--------|-----------|-------------|
| **FI** | Financial Accounting | Posting integrity, close-cycle health, failed transactions, queue backlog, integration lag |
| **MM** | Materials Management | Procurement workflow health, goods movement failures, vendor interface lag |
| **SD** | Sales & Distribution | Order-to-cash pipeline, delivery processing, billing failures |
| **PP** | Production Planning | Work order processing, BOM explosions, capacity planning failures |
| **HCM** | Human Capital Management | Payroll run integrity, org-data sync lag, time management failures |

Each module dashboard shows: availability %, failed transactions, queue backlog, integration lag, and core workflow status.

### 🚨 Incident Management
- **KPI cards** — Open, investigating, critical, and average resolve time at a glance
- **Create incidents** with system assignment, severity, and owner
- **State machine** — `open → investigating → identified → monitoring → resolved`
- **Notes** — Add investigation notes with timestamps to each incident
- **Delete** resolved/closed incidents
- **Demo seeding** — Sample incidents auto-created in demo mode

### 📞 On-Call & Escalation
- **KPI cards** and operational pulse overview
- **Create schedules** with rotation period and member list
- **Rotate** current responder on demand
- **Escalate** a schedule with a reason — event logged to timeline
- **Delete** schedules
- **Escalation event timeline** — full audit of escalation actions

### ⏱️ SLA Tracker
- Summary metrics: tracked systems, breach count, global uptime %, average MTTR
- Per-system error budget remaining
- Per-system MTTR, downtime, and SLA compliance percentage

### ⚡ Automation
- **KPI cards** — enabled rules, total runs, success rate, failures
- **Create rules** with trigger conditions and actions
- **Enable / disable** rules without deleting them
- **Run now** — trigger a rule immediately outside its schedule
- **Delete** rules
- **Execution run history** — per-rule run log with status and timestamps

### 🤖 Autonomous Ops
- **KPI cards** — pending, approved, applied, failed, and high-impact proposal counts
- **Generate proposals** — AI analyses connected ERP systems and suggests remediation actions
- **Approve / reject / apply** flows with full audit trail
- **Apply is admin-gated** — standard users can approve but not apply
- **Impact classification** — critical / high / medium / low with color coding
- **Error surface** for failed apply actions

### 🚢 Transport Governance
- **AI-reviewed transport requests** — each transport gets an AI risk assessment (safe / low / medium / high / critical) and a plain-English impact summary
- **Approval workflow** — draft → review → approved → released → imported
- **Create transport requests** specifying type, target system, and changed objects
- **Actions** — approve, reject, release per transport
- **KPI cards** — pending review, approved, released, high-risk counts

### 🔒 Security & Audit
- **ERP database users** — username, type, status, last login, failed login count per connection
- **Roles** — role definitions and assignments per ERP system
- **Privileges / grants** — privilege type, object, and grantee mapping
- **Audit policies** — active audit policies and their event types
- **Tab switching** — Users / Roles / Privileges / Audit grouped per connected system

### 🤖 AI Copilot
- **Conversational interface** — ask in plain English about any aspect of your SAP landscape
- **Powered by Groq** — sub-second responses with configurable model (default: `llama-3.3-70b-versatile`)
- **Conversation history** — full chat history persisted across sessions
- **RAG context** — copilot queries are grounded against connected ERP telemetry

### 🔔 Alerts
- ERP-system-level alerts surfaced per connection
- Severity-based routing to Slack, Teams, or email

### 📋 Audit Log
- Unified audit trail for all platform actions: incidents, on-call events, automation runs, autonomous actions, settings changes, and transport approvals

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser (React 19)                           │
│  Overview · Modules · Incidents · Automation · Autonomous · ...  │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTP / SWR polling
┌─────────────────────────▼────────────────────────────────────────┐
│                  Next.js 16 App Router                           │
│                                                                  │
│  /api/erp-overview     → ERP system health aggregation           │
│  /api/modules          → Per-module telemetry (FI/MM/SD/PP/HCM)  │
│  /api/connections      → ERP connection management               │
│  /api/processes        → Background job & interface monitoring   │
│  /api/transport        → Transport request lifecycle             │
│  /api/security         → Users, roles, grants, audit policies    │
│  /api/incidents        → Incident CRUD                           │
│  /api/oncall           → On-call schedule management             │
│  /api/sla              → SLA metrics                             │
│  /api/automation       → Rule engine & run history               │
│  /api/autonomous       → AI proposal generation and lifecycle    │
│  /api/copilot          → Groq LLM chat + RAG context             │
│  /api/settings         → App configuration                       │
│  /api/auth             → JWT cookie authentication               │
└──────┬──────────────────────────────────────┬───────────────────┘
       │                                      │
  ERP Systems                            data/*.json
  (OData / RFC / BAPI)              (connections, incidents,
  HANA / PostgreSQL /                oncall, automation rules/runs,
  MySQL / Redis / MongoDB            transports, autonomous proposals,
                                     users, audit, settings)
```

**Key design decisions:**
- **No external database required** — all persistent state lives in JSON files under `data/`. Simple, portable, and backup-friendly.
- **No agents** — connects to SAP systems over standard OData/RFC/BAPI endpoints you already expose.
- **Demo mode is automatic** — add a real ERP connection to go live; remove it to fall back to demo.
- **Auth** — JWT cookie (`vs_token`) with bcrypt-hashed passwords in `data/users.json`.

---

## Demo Mode

VynSAP ships with a full demo experience that activates automatically when no real ERP connection is configured.

- A synthetic demo ERP connection is injected in-memory (never written to disk).
- All ERP-backed pages (`overview`, `tenants`, `performance`, `alerts`, `memory`, `services`, `schema`, `security`, `backups`, `capacity`, `replication`, `queries`, `slow-queries`) use `src/lib/mock-erp.ts` for realistic data.
- Workflow pages auto-seed sample records:
  - Incidents (`src/lib/incident-store.ts`)
  - On-call schedules (`src/lib/oncall-store.ts`)
  - Automation rules and runs (`src/lib/automation-store.ts`)
  - Autonomous proposals (`src/lib/autonomous-store.ts`)
- The demo banner disappears automatically once a real ERP connection is added.

> To disable demo mode: add one real ERP connection via **Settings → Connections**.

---

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | **20+** | Install via [nvm](https://github.com/nvm-sh/nvm) |
| npm | **10+** | Bundled with Node 20 |
| Groq API key | — | Free tier at [console.groq.com](https://console.groq.com) |

**SAP connectivity** (optional — app runs in demo mode without it):

| Connection Type | SAP Requirement |
|----------------|----------------|
| OData | SAP Gateway (SM59 RFC destination or NW Gateway) |
| RFC / BAPI | SAP NetWeaver with RFC-enabled function modules |
| HANA direct | SAP HANA 2.0+ with tenant DB access |

---

## Installation

### Local Development

```bash
# 1. Clone
git clone https://github.com/vynops/VynSAP.git
cd VynSAP

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.local.example .env.local
```

Edit `.env.local` — minimum required values:

```env
AUTH_SECRET=<output of: openssl rand -base64 32>
GROQ_API_KEY=gsk_...          # free at https://console.groq.com
```

```bash
# 4. Start VynSAP
npm run dev
# → http://localhost:3080
```

**Default credentials:**

| Field | Value |
|-------|-------|
| Email | `admin@vynsap.local` |
| Password | `changeme` |

> ⚠️ Change the default password immediately via **Settings → Team**.

---

### Production with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Build the application
npm run build

# Start with PM2
pm2 start npm --name vynsap -- start
pm2 save
pm2 startup     # follow the printed command to enable auto-start on reboot

# Useful PM2 commands
pm2 status
pm2 logs vynsap
pm2 restart vynsap
```

---

## Configuration

All configuration lives in `.env.local`. Settings that can be changed at runtime are stored in `data/settings.json` and editable via **Settings** in the UI.

### Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | ✅ | Session encryption key. Generate: `openssl rand -base64 32` |

### AI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | ✅ | — | Groq API key — free tier at [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL` | ❌ | `llama-3.3-70b-versatile` | Groq model for AI Copilot and autonomous proposals |

> The active AI model can also be set at runtime via **Settings → AI Model** without a server restart.

### Notifications

| Variable | Description |
|----------|-------------|
| `SLACK_WEBHOOK_URL` | Incoming webhook URL from [Slack API](https://api.slack.com/messaging/webhooks) |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams incoming webhook URL |
| `SMTP_HOST` | SMTP hostname, e.g. `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port, e.g. `587` |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password or app password |
| `SMTP_FROM` | Sender address, e.g. `VynSAP <alerts@company.com>` |

### Runtime Settings (UI-editable)

These live in `data/settings.json` and are editable via **Settings** without a restart:

| Setting | Description |
|---------|-------------|
| `alertEmail` | Destination address for email alerts |
| `aiModel` | Active Groq model |
| `defaultRefreshSec` | Dashboard polling interval |
| `slaTargetUptimePct` | Global SLA uptime target (%) |
| `monitorIntervalSec` | Background monitor check interval |
| `alertThresholdCpuPct` | CPU % threshold for alerts |
| `alertThresholdMemPct` | Memory % threshold for alerts |
| `alertThresholdDiskPct` | Disk % threshold for alerts |
| `alertThresholdReplicationLagSec` | Replication lag threshold (seconds) |
| `autoProposals` | Enable automatic autonomous proposal generation |
| `maxExpensiveStatements` | Max slow-query records to surface |

---

## Connecting an ERP System

1. Navigate to **Settings → Connections** (or the **ERP Systems** page).
2. Click **Add Connection** and fill in:

| Field | Description |
|-------|-------------|
| Name | Display name (e.g. `PRD`, `QAS`) |
| Connector Type | `odata` / `rfc` / `bapi` |
| Endpoint URL | OData service root or RFC gateway URL |
| SAP Client | 3-digit SAP client number (e.g. `100`) |
| System Number | 2-digit system number (e.g. `00`) |
| Language | Logon language (e.g. `EN`) |
| Auth Type | `basic` / `oauth2` / `saml` |
| Host / Port | ERP application server host and port |
| Database | HANA tenant DB name or `SYSTEMDB` |
| Environment | `production` / `staging` / `development` / `test` |
| SSL | Enable TLS for the connection |

3. Click **Test Connection** — VynSAP probes the endpoint and reports connectivity, version, and latency.
4. Save. The demo banner disappears and live telemetry begins flowing.

> Multiple connections are supported — one per SID or environment. All pages that show per-connection data will automatically include the new system.

---

## SAP Modules

Each of the five core SAP functional modules has a dedicated dashboard page:

### FI — Financial Accounting
Monitors posting integrity and close-cycle health. Key metrics: availability %, failed transactions, queue backlog, integration lag. Core workflows surfaced: GL posting, AR/AP reconciliation, asset accounting, period close.

### MM — Materials Management
Monitors procurement and inventory workflows. Key metrics: PO processing rate, goods receipt failures, invoice verification lag. Core workflows: purchase order processing, goods movement, vendor invoice posting.

### SD — Sales & Distribution
Monitors order-to-cash pipeline health. Key metrics: order creation success rate, delivery processing failures, billing run exceptions. Core workflows: sales order processing, delivery, billing, credit management.

### PP — Production Planning
Monitors manufacturing execution health. Key metrics: work order completion rate, BOM explosion failures, capacity planning exceptions. Core workflows: production order processing, goods issue/receipt, MRP runs.

### HCM — Human Capital Management
Monitors HR data integrity and payroll health. Key metrics: payroll run success rate, org-data sync lag, time management failures. Core workflows: payroll processing, org management sync, time evaluation.

---

## Operations

### Incident Management

Incidents track every failure event with a structured lifecycle:

```
open → investigating → identified → monitoring → resolved
```

**Creating an incident:** Specify title, severity (critical / high / medium / low), affected system, and initial owner. The system automatically assigns based on current on-call schedule.

**During investigation:** Add timestamped notes, update severity and owner, progress through states.

**Closure:** Resolved or closed incidents can be deleted once the post-mortem is complete.

### On-Call Schedules

Manage rotation schedules per team or system:
- Define rotation period (days) with an ordered member list
- Rotate to the next responder with a single click
- Escalate with a reason — each escalation event is recorded in the timeline
- Multiple schedules can coexist (one per team, service, or region)

### SLA Tracker

| Metric | Description |
|--------|-------------|
| Tracked Systems | Count of systems under SLA monitoring |
| Breach Count | Number of SLA breaches in current window |
| Global Uptime % | Aggregate uptime across all tracked systems |
| Avg MTTR | Mean time to recovery across resolved incidents |
| Error Budget | Per-system remaining error budget |
| Per-system MTTR | Individual system mean time to recovery |

### Automation

Build no-code automation rules that run on a schedule or trigger condition:

1. **Create a rule** — define the trigger (condition + threshold) and the action (restart process, send alert, create incident, etc.)
2. **Enable/disable** rules without losing configuration
3. **Run now** — execute any rule immediately outside its schedule for testing or emergency use
4. **Monitor runs** — the run history shows each execution: timestamp, status, duration, and any error output

---

## AI Copilot

The AI Copilot provides a conversational interface for your SAP operations:

- **Ask anything** — "Why are FI postings failing?", "What's causing the MM backlog?", "Show me recent transport risks"
- **Grounded answers** — the copilot queries live ERP telemetry before answering, so responses reflect current system state
- **Persistent history** — full conversation history stored in `data/copilot-history.json`
- **Model selection** — change the active Groq model at runtime via Settings without restarting

**Groq free tier:** The default model (`llama-3.3-70b-versatile`) runs on Groq's free tier (30K tokens/min). No cost for typical ops usage.

---

## Autonomous Ops

VynSAP can analyse your ERP landscape and generate AI-driven remediation proposals:

**Proposal lifecycle:**

```
generated (pending) → approved → applied
                    → rejected
                    → failed (if apply errors)
```

**Generating proposals:**
1. Navigate to **Autonomous Ops**
2. Click **Generate Proposals** — the AI analyses connected ERP telemetry and creates a set of prioritised remediation suggestions
3. Review each proposal: description, impact level (critical / high / medium / low), and reasoning

**Approval gates:**
- Any user can approve or reject proposals
- Only **admin-role users** can apply proposals to live systems
- Applied proposals are logged to the audit trail

**Auto-proposals:** Set `autoProposals: true` in Settings to have VynSAP generate proposals automatically on each monitor cycle.

---

## Transport Governance

VynSAP provides an AI-assisted transport request workflow to reduce risk from configuration and code changes:

**Request lifecycle:**

```
draft → review → approved → released → imported
                → rejected
```

**Creating a transport request:**
1. Click **New Transport**
2. Specify: description, type (`customizing` / `workbench` / `support`), target system, and the list of changed objects
3. VynSAP immediately generates an AI risk assessment and plain-English impact summary

**AI risk levels:**

| Level | Meaning |
|-------|---------|
| `safe` | No cross-system dependencies detected |
| `low` | Minor impact, routine change |
| `medium` | Moderate impact, review recommended |
| `high` | Significant risk, senior approval required |
| `critical` | Potential system-wide impact, block and escalate |

**Actions:**
- **Approve** — mark request as approved and ready for release
- **Reject** — decline with reason logged
- **Release** — mark as released to target system

---

## Security & Audit

### ERP Security View

The Security page provides visibility into the ERP database security posture across all connected systems:

| Tab | Content |
|-----|---------|
| Users | Database users: type, status, last login, failed login count |
| Roles | Role definitions and their assignments |
| Privileges | Privilege type, target object, and grantee |
| Audit | Active audit policies and the event types they cover |

Data is fetched per connection — all registered ERP systems appear in a single view.

### Platform Audit Log

Every action taken inside VynSAP is written to the audit log:
- Incident create / update / delete
- On-call schedule changes and escalations
- Automation rule create / update / run
- Autonomous proposal generate / approve / reject / apply
- Transport create / approve / reject / release
- Settings changes (excluding secrets)
- User login / logout
- Connection add / delete / test

The audit log is stored in `data/audit.json` and surfaced on the **Audit Log** page with timestamp, actor, action type, and target.

---

## Notifications

Configure outbound notifications via **Settings → Notifications**:

### Slack
Point `SLACK_WEBHOOK_URL` (or set via Settings UI) to an [Incoming Webhook](https://api.slack.com/messaging/webhooks). Alerts and incident events are routed there automatically.

### Microsoft Teams
Set `TEAMS_WEBHOOK_URL` to a Teams channel connector URL.

### Email / SMTP
Configure SMTP credentials. Alert emails include severity, affected system, and a direct link to the incident.

### Live integration test
Settings page includes a **Test** button for each integration — sends a real test message to verify connectivity before alerts are needed.

> Notification credentials are never persisted if you submit a masked `***` value — only real credentials overwrite existing ones.

---

## Project Structure

```
vynsap/
├── src/
│   ├── app/
│   │   ├── (dashboard)/         # All authenticated dashboard pages
│   │   │   ├── overview/        # ERP health overview
│   │   │   ├── tenants/         # ERP systems / connections list
│   │   │   ├── services/        # Connector health
│   │   │   ├── alerts/          # ERP alerts
│   │   │   ├── fi/              # FI module dashboard
│   │   │   ├── mm/              # MM module dashboard
│   │   │   ├── sd/              # SD module dashboard
│   │   │   ├── pp/              # PP module dashboard
│   │   │   ├── hcm/             # HCM module dashboard
│   │   │   ├── incidents/       # Incident management
│   │   │   ├── oncall/          # On-call schedules
│   │   │   ├── sla/             # SLA tracker
│   │   │   ├── automation/      # Automation rules engine
│   │   │   ├── autonomous/      # AI autonomous ops
│   │   │   ├── transport/       # Transport governance
│   │   │   ├── security/        # ERP security & audit
│   │   │   ├── copilot/         # AI Copilot chat
│   │   │   ├── audit/           # Platform audit log
│   │   │   ├── performance/     # ERP performance metrics
│   │   │   ├── memory/          # HANA memory analysis
│   │   │   ├── queries/         # Query analytics
│   │   │   ├── slow-queries/    # Slow query monitor
│   │   │   ├── schema/          # Schema browser
│   │   │   ├── replication/     # Replication / HSR status
│   │   │   ├── backups/         # Backup status
│   │   │   ├── capacity/        # Capacity planning
│   │   │   ├── column-store/    # HANA column store
│   │   │   ├── team/            # User management
│   │   │   └── settings/        # Application settings
│   │   ├── api/                 # Next.js API route handlers
│   │   └── login/               # Login page
│   ├── components/
│   │   ├── layout/              # DashboardLayout, Header, Sidebar, DemoBanner
│   │   └── modules/             # ModuleDashboard (shared by FI/MM/SD/PP/HCM)
│   └── lib/
│       ├── connection-store.ts  # ERP connection management + demo detection
│       ├── mock-erp.ts          # Demo-mode ERP data generator
│       ├── incident-store.ts    # Incident persistence + demo seeding
│       ├── oncall-store.ts      # On-call schedule persistence + demo seeding
│       ├── automation-store.ts  # Automation rule/run persistence + demo seeding
│       ├── autonomous-store.ts  # Autonomous proposal persistence + demo seeding
│       ├── copilot.ts           # Groq LLM client
│       ├── copilot-history-store.ts  # Chat history persistence
│       ├── rag.ts               # RAG context builder for copilot
│       ├── settings-store.ts    # App settings persistence
│       ├── audit-store.ts       # Audit event persistence
│       ├── user-store.ts        # User account management
│       ├── notifications.ts     # Slack / Teams / email dispatch
│       ├── scheduler-runner.ts  # Automation rule scheduler
│       ├── auth.ts              # JWT auth helpers
│       └── utils.ts             # Shared utilities
├── data/                        # Runtime data (JSON files, not committed)
│   ├── connections.json         # ERP connections
│   ├── incidents.json           # Incident records
│   ├── oncall.json              # On-call schedules
│   ├── automation-rules.json    # Automation rule definitions
│   ├── automation-runs.json     # Automation execution history
│   ├── autonomous-proposals.json  # AI proposals
│   ├── transports.json          # Transport requests
│   ├── audit.json               # Audit log
│   ├── copilot-history.json     # AI Copilot chat history
│   ├── users.json               # User accounts
│   ├── settings.json            # App runtime settings
│   └── telemetry.json           # Telemetry cache
├── agent.md                     # Agent / developer notes
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## API Reference

All endpoints require authentication (valid `vs_token` cookie). Admin-only endpoints are noted.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/erp-overview` | Aggregated ERP health: connectors, processes, modules, events |
| GET | `/api/modules?code=FI` | Module telemetry for FI / MM / SD / PP / HCM |
| GET/POST | `/api/connections` | List or create ERP connections |
| DELETE | `/api/connections/[id]` | Delete a connection |
| POST | `/api/connections/test` | Test connection reachability |
| GET | `/api/processes` | Process SLO data and 24h trends |
| GET | `/api/alerts` | ERP-system alerts |
| GET | `/api/incidents` | List incidents |
| POST | `/api/incidents` | Create or update an incident |
| DELETE | `/api/incidents/[id]` | Delete an incident |
| GET | `/api/oncall` | List on-call schedules |
| POST | `/api/oncall` | Create schedule or perform action (rotate/escalate/delete) |
| GET | `/api/sla` | SLA metrics |
| GET | `/api/automation` | List rules and run history |
| POST | `/api/automation` | Create rule or perform action (enable/disable/run/delete) |
| GET | `/api/autonomous` | List proposals |
| POST | `/api/autonomous` | Generate proposals |
| PATCH | `/api/autonomous/[id]` | Approve / reject / apply a proposal |
| GET/POST | `/api/transport` | List or create transport requests; actions (approve/reject/release) |
| GET | `/api/security` | ERP users, roles, grants, and audit policies per connection |
| POST | `/api/copilot` | Send a message to the AI Copilot |
| GET | `/api/copilot` | Retrieve conversation history |
| GET | `/api/audit` | Platform audit log |
| GET/POST | `/api/settings` | Read or update app settings |
| POST | `/api/settings/test` | Test an integration (Groq / SMTP / Slack / Teams) — admin only |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/login` | Authenticate and set `vs_token` cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/team` | List users — admin only |
| POST | `/api/team` | Create user — admin only |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) App Router |
| UI | [React 19](https://react.dev), [Tailwind CSS v4](https://tailwindcss.com) |
| Charts | [Recharts](https://recharts.org) |
| Data fetching | [SWR](https://swr.vercel.app) |
| Icons | [Lucide React](https://lucide.dev) |
| AI / LLM | [Groq SDK](https://console.groq.com) — llama-3.3-70b-versatile (default) |
| Auth | [jose](https://github.com/panva/jose) — JWT, `vs_token` cookie |
| DB adapters | `pg` (PostgreSQL), `mysql2` (MySQL), `ioredis` (Redis), `mongodb` (MongoDB) |
| Email | [nodemailer](https://nodemailer.com) |
| Runtime | Node.js 20+ |
| Process manager | [PM2](https://pm2.keymetrics.io) |
| Language | TypeScript 5 |

---

## Troubleshooting

### App won't start

- Verify Node.js 20+: `node --version`
- Ensure `AUTH_SECRET` is set in `.env.local`
- Run `npm install` to make sure all dependencies are present
- Check port 3080 is free: `lsof -i :3080` (macOS/Linux) or `netstat -ano | findstr 3080` (Windows)

### Demo mode is stuck on

- Demo mode activates when `data/connections.json` is empty or absent
- Add a real ERP connection via **Settings → Connections** to disable it
- Verify the connection test passes before saving

### ERP connection test fails

- Confirm the SAP Gateway or RFC endpoint is reachable from the VynSAP host
- For HANA direct connections: verify the tenant DB is running (`SELECT * FROM M_DATABASES`)
- Check SAP Client, System Number, and credentials are correct
- If using SSL, ensure the certificate chain is trusted or disable `sslValidateCert` for testing

### AI Copilot returns no response

- Verify `GROQ_API_KEY` is set and valid at [console.groq.com](https://console.groq.com)
- Check the active AI model in **Settings** — ensure it matches a model available on your Groq plan
- Groq free tier is 30K tokens/min; heavy usage may trigger rate limits

### Settings test buttons fail

- Test buttons for Slack/Teams/Email require the respective credentials to be saved first
- SMTP: verify host, port, and credentials; for Gmail use an [App Password](https://myaccount.google.com/apppasswords)
- Slack: webhook URL must start with `https://hooks.slack.com/services/`
- Masked values (`***`) are not re-submitted — enter the real value if changing credentials

### Data files are missing or corrupted

All `data/*.json` files are auto-created with defaults if missing. To reset a specific store:

```bash
# Delete the file — VynSAP will recreate it with defaults on next request
rm data/incidents.json
```

> ⚠️ Deleting `data/users.json` resets all user accounts. The default admin account will be restored.

---

## Contributing

Contributions are welcome. Please:

1. Fork the repository and create a feature branch: `git checkout -b feature/your-feature`
2. Follow existing code style (TypeScript strict, Tailwind utility classes, no default exports from `lib/`)
3. Test in both demo mode and with a real ERP connection if applicable
4. Open a pull request with a clear description of the change

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

Part of the **[VynOps](https://vynops.online)** open-source operations platform family.

[VynOps](https://github.com/vynops/VynOps) · [VynHana](https://github.com/vynops/VynHana) · [VynDB](https://github.com/vynops/VynDB) · [VynAI](https://github.com/vynops/VynAI) · **VynSAP**

</div>

