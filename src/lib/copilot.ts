import { loadSettings } from './settings-store'
import Groq from 'groq-sdk'

let _client: Groq | null = null
let _clientKey: string | null = null

const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
type Message = { role: 'user' | 'assistant'; content: string }

export interface CopilotResult {
  reply: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  provider?: string
  model?: string
  error?: string
}

const STATUS_HINTS: Record<number, string> = {
  400: 'Bad request — check the model ID and request settings.',
  401: 'API key is invalid, expired, or revoked. Replace the key in Settings and save it again.',
  403: 'Access denied — the key lacks permission for this model/API, or the API is not enabled for its project.',
  404: 'Model or endpoint not found — check the AI Model ID (and Base URL for custom providers).',
  408: 'Request timed out at the provider. Try again.',
  413: 'Request too large for this model.',
  429: 'Rate limit or quota exceeded — wait and retry, choose another model, or check plan/billing.',
  500: 'Provider internal error. Try again later.',
  502: 'Provider gateway error. Try again later.',
  503: 'Provider is overloaded or unavailable. Try again later.',
  504: 'Provider gateway timeout. Try again or use a faster model.',
}

/** Builds a user-facing error from a failed AI provider response, including the provider's own message when available. */
export async function describeAiError(provider: string, model: string, response: Response): Promise<string> {
  let detail = ''
  try {
    const text = await response.text()
    try {
      const body = JSON.parse(text) as { error?: string | { message?: string }; message?: string }
      detail = typeof body.error === 'string' ? body.error : body.error?.message ?? body.message ?? ''
    } catch {
      detail = text.startsWith('<') ? '' : text
    }
  } catch { /* body unavailable */ }
  const hint = STATUS_HINTS[response.status] ?? (response.status >= 500 ? 'Provider server error. Try again later.' : 'Unexpected provider response.')
  const providerMsg = detail ? ` Provider says: "${detail.replace(/\s+/g, ' ').trim().slice(0, 240)}"` : ''
  return `${provider} API returned ${response.status} for model "${model}": ${hint}${providerMsg}`
}

// Stay below the reverse proxy's 60s read timeout so errors return as JSON, not an nginx HTML page.
const AI_TIMEOUT_MS = 40_000

export function getGroqClient(): Groq | null {
  const settings = loadSettings()
  const key = settings.aiApiKey ?? settings.groqApiKey ?? process.env.GROQ_API_KEY
  if (!key) return null
  if (!_client || _clientKey !== key) {
    _client = new Groq({ apiKey: key, timeout: AI_TIMEOUT_MS, maxRetries: 1 })
    _clientKey = key
  }
  return _client
}

function getGroqModel(): string {
  const settings = loadSettings()
  return settings.aiModel ?? process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL
}

export async function askCopilotDetailed(systemPrompt: string, userMessage: string): Promise<CopilotResult> {
  const settings = loadSettings()
  const provider = settings.aiProvider ?? 'groq'
  const apiKey = settings.aiApiKey || (provider === 'groq' ? settings.groqApiKey ?? process.env.GROQ_API_KEY : '')
  const model = settings.aiModel ?? process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL
  if (!apiKey) {
    return {
      reply: `No ${provider} API key configured. Add it in Settings > AI Copilot.`,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      error: `No ${provider} API key configured. Add it in Settings > AI Copilot.`,
    }
  }
  try {
    const messages: Message[] = [{ role: 'user', content: userMessage }]
    let reply = ''
    let promptTokens = 0
    let completionTokens = 0

    if (provider === 'groq') {
      const client = getGroqClient()
      if (!client) throw new Error('Groq API key is not configured')
      const completion = await client.chat.completions.create({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: 0.3, max_tokens: 2048 })
      reply = completion.choices[0]?.message?.content ?? 'No response from AI.'
      promptTokens = completion.usage?.prompt_tokens ?? 0
      completionTokens = completion.usage?.completion_tokens ?? 0
    } else if (provider === 'openai' || provider === 'custom') {
      const baseUrl = provider === 'custom' ? settings.aiBaseUrl : 'https://api.openai.com/v1'
      if (!baseUrl) throw new Error('Custom AI provider requires a base URL')
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...      messages], temperature: 0.3, max_tokens: 2048 }), signal: AbortSignal.timeout(AI_TIMEOUT_MS) })
      if (!response.ok) throw new Error(await describeAiError(provider, model, response))
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }
      reply = data.choices?.[0]?.message?.content ?? 'No response from AI.'
      promptTokens = data.usage?.prompt_tokens ?? 0
      completionTokens = data.usage?.completion_tokens ?? 0
    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, system: systemPrompt, messages, max_tokens: 2048 }), signal: AbortSignal.timeout(AI_TIMEOUT_MS) })
      if (!response.ok) throw new Error(await describeAiError(provider, model, response))
      const data = await response.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
      reply = data.content?.find(item => item.type === 'text')?.text ?? 'No response from AI.'
      promptTokens = data.usage?.input_tokens ?? 0
      completionTokens = data.usage?.output_tokens ?? 0
    } else if (provider === 'google') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: messages.map(message => ({ role: 'user', parts: [{ text: message.content }] })) }), signal: AbortSignal.timeout(AI_TIMEOUT_MS) })
      if (!response.ok) throw new Error(await describeAiError(provider, model, response))
      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
      reply = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? 'No response from AI.'
      promptTokens = data.usageMetadata?.promptTokenCount ?? 0
      completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0
    } else {
      throw new Error(`Unknown AI provider: ${provider}`)
    }
    return {
      reply,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      provider,
      model,
    }
  } catch (e) {
    return {
      reply: `AI error: ${(e as Error).message}`,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      error: (e as Error).message,
    }
  }
}

export async function askCopilot(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await askCopilotDetailed(systemPrompt, userMessage)
  return result.reply
}

export const ERP_COPILOT_SYSTEM = `You are VynSAP Copilot, an expert SAP ERP database assistant.
You help DBAs with:
- SAP ERP SQL (SQLScript, calculation views, procedures)
- ERP database monitoring views (M_*, SYS.*)
- Performance tuning (column store, row store, delta merge, memory)
- ERP database replication (HSR) configuration and troubleshooting
- Backup and recovery strategies
- Multi-Database Container (MDC) administration
- ERP database security (users, roles, privileges, audit policies)
- Smart Data Access and data federation
- cockpit-equivalent monitoring
- ERP alerts and trace analysis
Always provide precise, production-safe SQL. Note risks and prerequisites.`
