import { loadSettings } from './settings-store'
import Groq from 'groq-sdk'

let _client: Groq | null = null
let _clientKey: string | null = null

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

export interface CopilotResult {
  reply: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export function getGroqClient(): Groq | null {
  const settings = loadSettings()
  const key = settings.groqApiKey ?? process.env.GROQ_API_KEY
  if (!key) return null
  if (!_client || _clientKey !== key) {
    _client = new Groq({ apiKey: key })
    _clientKey = key
  }
  return _client
}

function getGroqModel(): string {
  const settings = loadSettings()
  return settings.aiModel ?? process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL
}

export async function askCopilotDetailed(systemPrompt: string, userMessage: string): Promise<CopilotResult> {
  const client = getGroqClient()
  if (!client) {
    return {
      reply: 'No AI API key configured. Add your Groq API key in Settings.',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
  }
  try {
    const completion = await client.chat.completions.create({
      model: getGroqModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    })
    return {
      reply: completion.choices[0]?.message?.content ?? 'No response from AI.',
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    }
  } catch (e) {
    return {
      reply: `AI error: ${(e as Error).message}`,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
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
