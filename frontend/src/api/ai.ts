/**
 * ai.ts — text-only AI chat over the WorkBuddy Cloud LLM module.
 *
 * Replaces the previous backend proxy (`POST /api/ai/chat`), which served a
 * deterministic mock. The participant-facing AI panel must talk to a real model:
 * this platform records how students use AI, so a canned reply would fabricate
 * study data. Real calls also mean failures are visible — every failure path
 * produces an explicit, retryable error instead of silently inventing text.
 *
 * Input stays text-only (no images, audio or tool calls) per the project scope.
 */
import { CloudOpenAIError, type PublicLLMModel } from '@tencent-ai/workbuddy-cloud-sdk'
import { cloud } from '../cloud/client'
import { http } from '../api/http'

/**
 * Application-owned system prompt. It is always `messages[0]`; the API rejects a
 * request that does not start with one. It carries no end-user input, so a
 * participant cannot rewrite these instructions through the chat box.
 */
const SYSTEM_PROMPT = [
  'You are the built-in AI assistant of Beyond, a research platform that studies how',
  'engineering-design students work with AI during a design task.',
  'Reply in plain text only, and keep replies concise: two to five sentences unless the',
  'student explicitly asks for more detail.',
  'Help the student reason about the design problem - surface assumptions, trade-offs and',
  'next steps - rather than handing over a finished solution.',
  'Say so plainly when a question is underspecified instead of guessing.',
  'Never claim to see the student screen, files, camera or microphone.',
].join(' ')

/** Hard cap on a single prompt, so one participant cannot drain the app quota. */
const MAX_PROMPT_CHARS = 4000
/** Bounded history: only the last N turns are sent, to keep requests small. */
const MAX_HISTORY_TURNS = 8
const MAX_HISTORY_CHARS = 2000

/**
 * Pinned chat model: `deepseek-v4.1-flash` (DeepSeek flagship line, 1M context,
 * lowest credit multiplier of the DeepSeek tier). A study that measures how
 * students use AI must hold the model constant across participants, and "auto"
 * routes each request to a different underlying model with a variable credit
 * multiplier - a hidden confound in both method and cost.
 *
 * The id must exist in this app's model directory. If it is ever retired, the
 * code falls back to the directory's own default rather than failing - but the
 * fallback is logged so the change does not go unnoticed.
 */
const PINNED_MODEL_ID = 'deepseek-v4.1-flash'

/**
 * Synthetic model id used when the WorkBuddy Cloud LLM module is unreachable
 * (no publishable key / 401 locally). The participant AI panel then routes
 * through the backend `POST /api/ai/chat` proxy instead of being dead. P0 #4.
 */
const BACKEND_MODEL_ID = 'backend-ai'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChatOptions {
  /** The participant's message. */
  prompt: string
  /** Prior turns of this conversation, oldest first. Bounded by this module. */
  history: ChatTurn[]
  /** Application-owned conversation id; stable across turns of one chat. */
  conversationId: string
  /** Optional explicit model id. Falls back to the first selectable model. */
  modelId?: string
  /** Lets the caller stop generation. */
  signal?: AbortSignal
  /** Called with each text fragment as it arrives. */
  onDelta: (delta: string) => void
}

export interface StreamChatResult {
  text: string
  model: string
  finishReason: string | null
  /** True when the caller aborted before the stream finished. */
  aborted: boolean
}

/** A failure the UI can render as-is. */
export class LlmCallError extends Error {
  readonly retryable: boolean
  readonly requestId?: string
  /** Text already streamed before the failure; render it rather than discarding. */
  readonly partialText: string

  constructor(message: string, retryable: boolean, requestId?: string, partialText = '') {
    super(message)
    this.name = 'LlmCallError'
    this.retryable = retryable
    this.requestId = requestId
    this.partialText = partialText
  }
}

let modelCache: PublicLLMModel[] | null = null
/** True when the cloud LLM module failed and we are on the backend proxy. */
let usingBackendFallback = false

/** Fetch (and memoise) the public model directory for this application. */
export async function listChatModels(signal?: AbortSignal): Promise<PublicLLMModel[]> {
  if (modelCache) return modelCache
  try {
    const models = await cloud.llm.models.list(signal)
    modelCache = models
    usingBackendFallback = false
    return models
  } catch (error) {
    // The WorkBuddy Cloud LLM module is not configured in this environment
    // (no publishable key / 401 from cloud auth). Rather than leave the AI
    // panel dead, fall back to the backend proxy at POST /api/ai/chat, which
    // answers with a real model when AI_API_KEY is set and otherwise a clearly
    // labelled mock. This is the P0 #4 local-availability fix.
    console.warn('[ai] WorkBuddy Cloud LLM unavailable; using backend /api/ai/chat fallback:', error)
    usingBackendFallback = true
    modelCache = [backendFallbackModel()]
    return modelCache
  }
}

/**
 * Synthetic model entry for the backend /api/ai/chat proxy, surfaced only when
 * the WorkBuddy Cloud LLM module is unreachable so the participant panel still
 * has a model to address locally.
 */
function backendFallbackModel(): PublicLLMModel {
  return {
    id: BACKEND_MODEL_ID,
    name: 'Backend AI (proxy)',
    enabled: true,
    isDefault: true,
    disabled: false,
    sortOrder: 0,
    temperature: 0.7,
  }
}

/**
 * Pick the model to use: the pinned study model when the directory offers it,
 * otherwise the directory's default (default-flagged first, then `sortOrder`),
 * skipping anything marked as not selectable. An empty directory is legal and
 * is handled by the caller — there is no invented fallback model id.
 */
export function pickChatModel(models: PublicLLMModel[]): PublicLLMModel | undefined {
  const selectable = models.filter((model) => model.disabled !== true && model.enabled !== false)
  const pinned = selectable.find((model) => model.id === PINNED_MODEL_ID)
  if (pinned) return pinned

  if (models.some((model) => model.id === PINNED_MODEL_ID)) {
    console.warn(
      `[ai] pinned model "${PINNED_MODEL_ID}" is present but not selectable; falling back to the directory default`,
    )
  } else {
    console.warn(`[ai] pinned model "${PINNED_MODEL_ID}" not in the model directory; falling back to the default`)
  }

  const ordered = [...selectable].sort((a, b) => {
    const byDefault = Number(b.isDefault ?? false) - Number(a.isDefault ?? false)
    if (byDefault !== 0) return byDefault
    return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
  })
  return ordered[0]
}

/** Strip control characters and cap length before the text reaches the model. */
function sanitisePrompt(input: string): string {
  let cleaned = ''
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    cleaned += code < 32 || code === 127 ? ' ' : char
  }
  return cleaned.slice(0, MAX_PROMPT_CHARS)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** Map an error to something a participant (and a researcher) can act on. */
function toCallError(error: unknown, partialText: string): LlmCallError {
  if (error instanceof CloudOpenAIError) {
    const code = error.error.code ?? ''
    const upstream = error.error.message ? ` Upstream: ${error.error.message}` : ''
    const requestId = error.requestId

    if (code.startsWith('request_')) {
      return new LlmCallError(
        `The model service rejected this request (${code}).${upstream}`,
        false,
        requestId,
        partialText,
      )
    }
    if (code.startsWith('auth_')) {
      return new LlmCallError(
        'This app is not authorised to call the model service from the current site address. Open the published app URL and retry.',
        false,
        requestId,
        partialText,
      )
    }
    if (code.startsWith('quota_')) {
      if (code === 'quota_rate_limited' && error.retryAfterMs) {
        const seconds = Math.max(1, Math.ceil(error.retryAfterMs / 1000))
        return new LlmCallError(
          `Rate limited. Retry in about ${seconds} second${seconds === 1 ? '' : 's'}.`,
          true,
          requestId,
          partialText,
        )
      }
      return new LlmCallError(
        'The model quota for this app is exhausted. Ask the researcher to top it up.',
        false,
        requestId,
        partialText,
      )
    }
    if (code.startsWith('gateway_') || code.startsWith('model_')) {
      return new LlmCallError(
        'The model service is temporarily unavailable. Retry in a moment.',
        true,
        requestId,
        partialText,
      )
    }
    if (code.startsWith('internal_')) {
      return new LlmCallError(
        `Unexpected model-service error${requestId ? ` (request ${requestId})` : ''}.`,
        true,
        requestId,
        partialText,
      )
    }
    return new LlmCallError(`The model call failed (${code || 'unknown'}).${upstream}`, true, requestId, partialText)
  }

  return new LlmCallError(
    'The model service could not be reached. Check the network connection and retry.',
    true,
    undefined,
    partialText,
  )
}

/** Generate an application-owned conversation id for a new chat. */
export function createConversationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Backend-proxy path used when the WorkBuddy Cloud LLM module is unavailable
 * (P0 #4). The backend `POST /api/ai/chat` takes `{ message, context }` and
 * returns `{ reply }`; we hand the reply back through `onDelta` so the UI
 * renders it exactly as it would a streamed reply.
 */
async function streamChatBackend(
  options: StreamChatOptions,
  modelId: string,
): Promise<StreamChatResult> {
  const history = options.history
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => `${turn.role}: ${turn.content.slice(0, MAX_HISTORY_CHARS)}`)
  const context = [SYSTEM_PROMPT, ...history].join('\n')
  try {
    const res = await http.post<{ reply: string }>('/ai/chat', {
      message: sanitisePrompt(options.prompt),
      context,
    })
    const text = res?.reply ?? ''
    options.onDelta(text)
    return { text, model: modelId, finishReason: 'stop', aborted: false }
  } catch (error) {
    if (isAbortError(error)) {
      return { text: '', model: modelId, finishReason: null, aborted: true }
    }
    throw new LlmCallError(
      'The backend AI proxy could not be reached. Start the backend and retry.',
      true,
    )
  }
}

/**
 * Run one streaming chat turn.
 *
 * The API is streaming-only: `stream: true` is mandatory, and `messages[0]` is
 * always the application-owned system prompt. `conversationId` keeps related
 * turns associated server-side for metering and diagnostics — it is NOT a
 * history store, so the caller passes its own bounded `history` each turn.
 */
export async function streamChat(options: StreamChatOptions): Promise<StreamChatResult> {
  const models = await listChatModels(options.signal)
  const requested = options.modelId ? models.find((model) => model.id === options.modelId) : undefined
  const model = (requested && requested.disabled !== true ? requested : undefined) ?? pickChatModel(models)

  if (!model) {
    throw new LlmCallError('No AI model is available for this app right now.', false)
  }

  // P0 #4: when the cloud LLM module is unreachable, route through the backend
  // proxy instead of failing the whole panel.
  if (usingBackendFallback || model.id === BACKEND_MODEL_ID) {
    return streamChatBackend(options, model.id)
  }

  const history = options.history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.role,
    content: turn.content.slice(0, MAX_HISTORY_CHARS),
  }))

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...history,
    { role: 'user' as const, content: sanitisePrompt(options.prompt) },
  ]

  let text = ''
  let finishReason: string | null = null

  try {
    for await (const chunk of cloud.llm.chat.completions.create({
      model: model.id,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: model.temperature,
      conversationId: options.conversationId,
      signal: options.signal,
    })) {
      const choice = chunk.choices[0]
      const delta = choice?.delta?.content
      if (delta) {
        text += delta
        options.onDelta(delta)
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason
    }
  } catch (error) {
    if (isAbortError(error)) {
      return { text, model: model.id, finishReason, aborted: true }
    }
    // P0 #4: the cloud chat call itself is unavailable (gateway / model /
    // auth / quota). Fall back to the backend proxy so the panel still answers
    // locally — but only when nothing has streamed yet, otherwise we would
    // splice a second reply onto the partial text.
    if (text.length === 0) {
      console.warn('[ai] cloud chat unavailable, falling back to backend proxy:', error)
      return streamChatBackend(options, BACKEND_MODEL_ID)
    }
    throw toCallError(error, text)
  }

  return { text, model: model.id, finishReason, aborted: false }
}
