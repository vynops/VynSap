'use client'

import useSWR from 'swr'
import { useState, useEffect } from 'react'
import { Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const GROQ_MODELS = [
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Recommended)' },
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Fast)' },
  { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Long context)' },
  { value: 'gemma2-9b-it', label: 'Gemma 2 9B IT' },
  { value: 'llama3-70b-8192', label: 'Llama 3 70B' },
]

type TestKind = 'groq' | 'email' | 'slack' | 'teams'
type SelectOption = { value: string; label: string }
type InputField = {
  key: string
  label: string
  type: 'number' | 'email' | 'password' | 'text'
  placeholder: string
}
type SelectField = {
  key: string
  label: string
  type: 'select'
  options: SelectOption[]
}
type SettingsField = InputField | SelectField
type SettingsSection = {
  title: string
  tests?: { kind: TestKind; label: string }[]
  fields: SettingsField[]
}

export default function SettingsPage() {
  const { data, isLoading, mutate } = useSWR('/api/settings', fetcher)
  const [form, setForm] = useState<Record<string, string | number>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})

  useEffect(() => {
    if (data) {
      setForm({
        ...data,
        aiModel: data.aiModel ?? 'llama-3.3-70b-versatile',
      })
    }
  }, [data])

  const f = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }))

  async function runTest(kind: TestKind) {
    setTesting(prev => ({ ...prev, [kind]: true }))
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, settings: form }),
      })
      const payload = await res.json()
      setTestResults(prev => ({
        ...prev,
        [kind]: {
          ok: Boolean(payload.ok),
          message: String(payload.message ?? payload.error ?? 'Test failed'),
        },
      }))
    } catch (e) {
      setTestResults(prev => ({
        ...prev,
        [kind]: {
          ok: false,
          message: (e as Error).message,
        },
      }))
    } finally {
      setTesting(prev => ({ ...prev, [kind]: false }))
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    mutate()
  }

  if (isLoading) return <div className="text-slate-600 text-sm py-8 text-center">Loading settings…</div>

  const sections: SettingsSection[] = [
    {
      title: 'General',
      fields: [
        { key: 'defaultRefreshSec', label: 'Dashboard Refresh (sec)', type: 'number', placeholder: '30' },
        { key: 'monitorIntervalSec', label: 'Monitor Check Interval (sec)', type: 'number', placeholder: '60' },
        { key: 'maxExpensiveStatements', label: 'Max Expensive Statements', type: 'number', placeholder: '100' },
      ],
    },
    {
      title: 'Alert Thresholds',
      fields: [
        { key: 'alertThresholdCpuPct', label: 'CPU Alert Threshold (%)', type: 'number', placeholder: '85' },
        { key: 'alertThresholdMemPct', label: 'Memory Alert Threshold (%)', type: 'number', placeholder: '90' },
        { key: 'alertThresholdDiskPct', label: 'Disk Alert Threshold (%)', type: 'number', placeholder: '80' },
        { key: 'alertThresholdReplicationLagSec', label: 'HSR Lag Alert Threshold (sec)', type: 'number', placeholder: '10' },
        { key: 'slaTargetUptimePct', label: 'SLA Target Uptime (%)', type: 'number', placeholder: '99.9' },
      ],
    },
    {
      title: 'AI Copilot',
      tests: [{ kind: 'groq', label: 'Test Groq API' }],
      fields: [
        { key: 'groqApiKey', label: 'Groq API Key', type: 'password', placeholder: 'gsk_…' },
        { key: 'aiModel', label: 'AI Model', type: 'select', options: GROQ_MODELS },
      ],
    },
    {
      title: 'Email / SMTP',
      tests: [{ kind: 'email', label: 'Test Email' }],
      fields: [
        { key: 'alertEmail', label: 'Alert Email', type: 'email', placeholder: 'dba@company.com' },
        { key: 'smtpHost', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com' },
        { key: 'smtpPort', label: 'SMTP Port', type: 'number', placeholder: '587' },
        { key: 'smtpUser', label: 'SMTP Username', type: 'text', placeholder: 'user@company.com' },
        { key: 'smtpPass', label: 'SMTP Password', type: 'password', placeholder: '••••••••' },
      ],
    },
    {
      title: 'Notifications',
      tests: [
        { kind: 'slack', label: 'Test Slack' },
        { kind: 'teams', label: 'Test Teams' },
      ],
      fields: [
        { key: 'slackWebhook', label: 'Slack Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/…' },
        { key: 'teamsWebhook', label: 'MS Teams Webhook URL', type: 'text', placeholder: 'https://outlook.office.com/…' },
      ],
    },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <p className="text-sm text-slate-400 mt-0.5">Application configuration</p>
        </div>
      </div>
      <form onSubmit={handleSave} className="space-y-6">
        {sections.map(section => (
          <div key={section.title} className="rounded-2xl bg-[#0f1629] border border-slate-800 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{section.title}</h3>
              <div className="flex items-center gap-2">
                {section.tests?.map(test => (
                  <button
                    key={test.kind}
                    type="button"
                    onClick={() => runTest(test.kind)}
                    disabled={Boolean(testing[test.kind])}
                    className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white disabled:opacity-60"
                  >
                    {testing[test.kind] ? 'Testing…' : test.label}
                  </button>
                ))}
              </div>
            </div>
            {section.tests?.map(test => testResults[test.kind] ? (
              <p
                key={`${test.kind}-result`}
                className={cn('mb-3 text-xs', testResults[test.kind].ok ? 'text-emerald-400' : 'text-red-400')}
              >
                {testResults[test.kind].message}
              </p>
            ) : null)}
            <div className="space-y-3">
              {section.fields.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">{field.label}</label>
                  {field.type === 'select' ? (
                    <select
                      value={String(form[field.key] ?? '')}
                      onChange={e => f(field.key, e.target.value)}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      {field.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={String(form[field.key] ?? '')}
                      onChange={e => f(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <button type="submit" disabled={saving}
          className={cn(
            'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors',
            saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white',
            saving && 'opacity-50'
          )}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
