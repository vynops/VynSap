'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Bot, Send, Loader2, Trash2, History, Sigma } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Message { role: 'user' | 'assistant'; content: string }
interface CopilotHistoryEntry {
  id: string
  connName?: string
  prompt: string
  reply: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  createdAt: string
}

export default function CopilotPage() {
  const { data: conns } = useSWR('/api/connections', fetcher)
  const { data: copilotData, mutate } = useSWR('/api/copilot', fetcher)
  const [connId, setConnId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const connList = Array.isArray(conns) ? conns : []
  const history: CopilotHistoryEntry[] = Array.isArray(copilotData?.history) ? copilotData.history : []
  const usage = copilotData?.usage ?? {
    totalPrompts: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    prompts24h: 0,
    avgTokensPerPrompt: 0,
  }

  const suggestions = [
    'What are the top memory consumers in my column store?',
    'Show me SQL to analyze delta merge candidates',
    'How do I configure ERP database replication for high availability?',
    'Explain ERP database memory allocation limit and how to tune it',
    'Write a SQL to find expensive queries in the last hour',
    'What are best practices for SAP ERP database backup strategy?',
    'How do I monitor HSR lag using M_SERVICE_REPLICATION?',
    'Explain ERP database column store vs row store — when to use each',
  ]

  async function send(msg?: string) {
    const text = msg ?? input.trim()
    if (!text) return
    setInput('')
    const userMsg: Message = { role: 'user', content: text }
    const nextHistory = [...messages, userMsg]
    setMessages(nextHistory)
    setLoading(true)
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, connId, history: nextHistory }),
      })
      const d = await res.json()
      setMessages(p => [...p, { role: 'assistant', content: d.reply ?? 'No response.' }])
      mutate()
    } catch {
      setMessages(p => [...p, { role: 'assistant', content: 'Network error — try again.' }])
    } finally {
      setLoading(false)
    }
  }

  async function clearHistory() {
    setMessages([])
    await fetch('/api/copilot', { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">VynSAP AI Copilot</h2>
            <p className="text-sm text-slate-400 mt-0.5">Expert SAP ERP assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={connId} onChange={e => setConnId(e.target.value)}
            className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
            <option value="">No system context</option>
            {connList.map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {(messages.length > 0 || history.length > 0) && (
            <button onClick={clearHistory} className="text-slate-500 hover:text-slate-300 transition-colors" title="Clear chat history">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-blue-400">{usage.totalPrompts}</div>
          <div className="text-xs text-slate-500">Prompts</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-cyan-400">{usage.prompts24h}</div>
          <div className="text-xs text-slate-500">Prompts (24h)</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-purple-400">{usage.totalTokens.toLocaleString()}</div>
          <div className="text-xs text-slate-500">Total Tokens</div>
        </div>
        <div className="rounded-xl bg-[#0f1629] border border-slate-800 p-4 text-center">
          <div className="text-xl font-black text-emerald-400">{usage.avgTokensPerPrompt}</div>
          <div className="text-xs text-slate-500">Avg Tokens/Prompt</div>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Messages */}
      <div className="flex min-h-0 flex-col overflow-y-auto rounded-2xl bg-[#0f1629] border border-slate-800 p-4 space-y-4 mb-4 lg:mb-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Bot className="w-12 h-12 text-blue-500/50 mb-4" />
            <p className="text-slate-500 text-sm text-center mb-6">Ask me anything about SAP ERP — monitoring, tuning, SQL, HSR, backups, security…</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)}
                  className="text-left text-xs bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-slate-800/80 text-slate-200 rounded-bl-sm'
              )}>
                {m.role === 'assistant' ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm">{m.content}</pre>
                ) : m.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0f1629] lg:mb-0">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <History className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-400">Prompt History</span>
          <span className="ml-auto text-[10px] text-slate-600">{history.length} saved</span>
        </div>
        <div className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800/60 text-[10px] text-slate-500">
          <div className="px-4 py-2">Prompt tokens: {usage.promptTokens.toLocaleString()}</div>
          <div className="px-4 py-2">Completion tokens: {usage.completionTokens.toLocaleString()}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {history.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No saved prompt history yet.</div>
          ) : history.map(item => (
            <div key={item.id} className="px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-600">
                <Sigma className="h-3 w-3" />
                <span>{item.totalTokens} tokens</span>
                {item.connName && <span className="truncate">{item.connName}</span>}
              </div>
              <div className="text-xs font-semibold text-slate-200">{item.prompt}</div>
              <div className="mt-1 line-clamp-3 text-[11px] text-slate-500">{item.reply}</div>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask about ERP performance, SQL, replication, backups…"
          className="flex-1 bg-[#0f1629] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button onClick={() => send()} disabled={!input.trim() || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 rounded-xl transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
