'use client'

import useSWR from 'swr'
import { useState, useEffect } from 'react'
import { Eye, EyeOff, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const AI_PROVIDERS = [
  { id: 'groq', label: 'Groq (Recommended)', keyLabel: 'Groq API Key', placeholder: 'gsk_…', defaultModel: 'openai/gpt-oss-120b', models: [{ value: 'openai/gpt-oss-120b', label: 'GPT OSS 120B' }, { value: 'openai/gpt-oss-20b', label: 'GPT OSS 20B (Fast)' }, { value: 'groq/compound', label: 'Groq Compound' }, { value: 'groq/compound-mini', label: 'Groq Compound Mini' }] },
  { id: 'openai', label: 'OpenAI', keyLabel: 'OpenAI API Key', placeholder: 'sk-…', defaultModel: 'gpt-4o-mini', models: [{ value: 'gpt-4o', label: 'GPT-4o' }, { value: 'gpt-4o-mini', label: 'GPT-4o Mini' }, { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }] },
  { id: 'anthropic', label: 'Anthropic (Claude)', keyLabel: 'Claude API Key', placeholder: 'sk-ant-…', defaultModel: 'claude-3-5-sonnet-latest', models: [{ value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' }, { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }] },
  { id: 'google', label: 'Google (Gemini)', keyLabel: 'Gemini API Key', placeholder: 'AIza…', defaultModel: 'gemini-2.0-flash', models: [{ value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }, { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }] },
  { id: 'custom', label: 'Custom / Self-Hosted', keyLabel: 'API Key', placeholder: 'your-api-key', defaultModel: 'your-model-id', models: [] },
]

type TestKind = 'groq' | 'openai' | 'anthropic' | 'google' | 'custom' | 'email' | 'slack' | 'teams' | 'webhook'
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
  const [showAiKey, setShowAiKey] = useState(false)
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})

  useEffect(() => {
    if (data) {
      const providerId = data.aiProvider ?? 'groq'
      const provider = AI_PROVIDERS.find(item => item.id === providerId) ?? AI_PROVIDERS[0]
      const configuredModel = String(data.aiModel ?? '')
      const model = provider.models.length > 0 && !provider.models.some(item => item.value === configuredModel)
        ? provider.defaultModel
        : configuredModel || provider.defaultModel
      setForm({
        ...data,
        aiProvider: provider.id,
        aiModel: model,
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
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(res.ok)
    setTimeout(() => setSaved(false), 2000)
    mutate()
  }

  if (isLoading) return <div className="text-slate-600 text-sm py-8 text-center">Loading settings…</div>

  const currentProvider = AI_PROVIDERS.find(provider => provider.id === form.aiProvider) ?? AI_PROVIDERS[0]
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
      tests: [{ kind: currentProvider.id as TestKind, label: `Test ${currentProvider.label.replace(' (Recommended)', '')}` }],
      fields: [
        { key: 'aiProvider', label: 'AI Provider', type: 'select', options: AI_PROVIDERS.map(provider => ({ value: provider.id, label: provider.label })) },
        { key: 'aiApiKey', label: currentProvider.keyLabel, type: 'password', placeholder: currentProvider.placeholder },
        ...(currentProvider.id === 'custom' ? [{ key: 'aiBaseUrl', label: 'API Base URL', type: 'text' as const, placeholder: 'https://ai.internal/v1' }] : []),
        ...(currentProvider.models.length > 0 ? [{ key: 'aiModel', label: 'AI Model', type: 'select' as const, options: currentProvider.models }] : [{ key: 'aiModel', label: 'AI Model ID', type: 'text' as const, placeholder: currentProvider.defaultModel }]),
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
        { kind: 'webhook', label: 'Test Webhook' },
      ],
      fields: [
        { key: 'slackWebhook', label: 'Slack Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/…' },
        { key: 'teamsWebhook', label: 'MS Teams Webhook URL', type: 'text', placeholder: 'https://outlook.office.com/…' },
        { key: 'customWebhook', label: 'Custom Webhook URL', type: 'text', placeholder: 'https://example.com/vynsap/webhook' },
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
                      onChange={e => {
                        if (field.key === 'aiProvider') {
                          const nextProvider = AI_PROVIDERS.find(provider => provider.id === e.target.value) ?? AI_PROVIDERS[0]
                          setForm(previous => ({ ...previous, aiProvider: nextProvider.id, aiModel: nextProvider.defaultModel, aiApiKey: '', aiBaseUrl: '' }))
                        } else {
                          f(field.key, e.target.value)
                        }
                      }}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      {field.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : field.key === 'aiApiKey' ? (
                    <div className="relative">
                      <input
                        type={showAiKey ? 'text' : 'password'}
                        value={String(form[field.key] ?? '')}
                        onChange={e => f(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAiKey(value => !value)}
                        aria-label={showAiKey ? 'Hide AI API key' : 'Show AI API key'}
                        title={showAiKey ? 'Hide AI API key' : 'Show AI API key'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-white"
                      >
                        {showAiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
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
