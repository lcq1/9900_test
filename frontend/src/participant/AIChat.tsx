/**
 * AIChat.tsx — participant AI assistant panel (text-only).
 *
 * Talks to a real model through the WorkBuddy Cloud LLM module and renders the
 * reply token-by-token as it streams. Everything is text-only: no image, audio
 * or tool-call input is accepted.
 *
 * There is deliberately NO local canned reply. This platform measures how
 * students use AI, so fabricating an assistant answer would corrupt the study
 * data; a failed call is shown as a failure with a retry instead.
 *
 * `onUserMessage` / `onAssistantReply` keep the host (StageRenderer) logging both
 * sides into the EventQueue for the unified timeline.
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bot, Send, Square } from 'lucide-react'
import type { PublicLLMModel } from '@tencent-ai/workbuddy-cloud-sdk'
import {
  LlmCallError,
  createConversationId,
  listChatModels,
  pickChatModel,
  streamChat,
  type ChatTurn,
} from '../api/ai'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface AIChatProps {
  /** Short label describing the stage context, shown in the header. */
  contextLabel?: string
  placeholder?: string
  /** Called with the participant's message so the host can log it to EventQueue. */
  onUserMessage?: (text: string) => void
  /** Called with the final assistant reply so callers can log it to EventQueue. */
  onAssistantReply?: (text: string) => void
}

export function AIChat({ contextLabel, placeholder, onUserMessage, onAssistantReply }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [models, setModels] = useState<PublicLLMModel[]>([])
  const [modelId, setModelId] = useState('')
  const [error, setError] = useState('')
  const [lastPrompt, setLastPrompt] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** One application-owned conversation id for this chat; rotated on remount. */
  const conversationIdRef = useRef<string>(createConversationId())
  const streamingRef = useRef(false)

  useEffect(() => {
    let active = true
    listChatModels()
      .then((list) => {
        if (!active) return
        const selected = pickChatModel(list)
        setModels(list)
        setModelId((current) => current || selected?.id || '')
        if (!selected) {
          setError('No AI model is available for this app right now.')
        }
      })
      .catch(() => {
        if (active) setError('Could not load the AI model list. Check the connection and retry.')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const submit = async (rawText: string, isRetry: boolean) => {
    const text = rawText.trim()
    if (!text || streamingRef.current) return

    const last = messages[messages.length - 1]
    const base = isRetry && last?.role === 'assistant' ? messages.slice(0, -1) : messages

    const history: ChatTurn[] = base
      .filter((message) => message.text.trim().length > 0)
      .map((message) => ({ role: message.role, content: message.text }))

    const assistantId = `a-${Date.now()}`
    const nextMessages = isRetry
      ? [...base, { id: assistantId, role: 'assistant' as const, text: '' }]
      : [
          ...base,
          { id: `u-${Date.now()}`, role: 'user' as const, text },
          { id: assistantId, role: 'assistant' as const, text: '' },
        ]

    setMessages(nextMessages)
    setError('')
    setLastPrompt(text)
    streamingRef.current = true
    setStreaming(true)
    if (!isRetry) {
      setInput('')
      onUserMessage?.(text)
    }

    const controller = new AbortController()
    abortRef.current = controller
    let received = ''

    try {
      const result = await streamChat({
        prompt: text,
        history,
        conversationId: conversationIdRef.current,
        modelId: modelId || undefined,
        signal: controller.signal,
        onDelta: (delta) => {
          received += delta
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, text: received } : message,
            ),
          )
        },
      })
      if (result.text) onAssistantReply?.(result.text)
    } catch (caught) {
      if (caught instanceof LlmCallError) {
        if (!received) {
          setMessages((current) => current.filter((message) => message.id !== assistantId))
        }
        setError(caught.message)
      } else if (!(caught instanceof Error && caught.name === 'AbortError')) {
        setError('The AI service could not be reached. Check your connection and retry.')
      }
    } finally {
      abortRef.current = null
      streamingRef.current = false
      setStreaming(false)
    }
  }

  const stop = () => abortRef.current?.abort()

  /**
   * The model is chosen here, not by the participant: a study that measures how
   * students use AI needs the model held constant across participants, so the
   * panel only displays which model answered.
   */
  const modelLabel = models.find((model) => model.id === modelId)?.name ?? ''

  return (
    <div className="ai-chat">
      <div className="ai-chat-head">
        <span className="ai-chat-title">
          <Bot size={15} /> AI assistant
          {contextLabel ? ` · ${contextLabel}` : ''}
        </span>
        <small className="ai-chat-note">
          Text-only{modelLabel ? ` · ${modelLabel}` : ''}
        </small>
      </div>

      <div className="ai-chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="ai-chat-empty">
            Ask the assistant about your task. Responses are text-only and timestamped.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === 'user' ? 'ai-msg user' : 'ai-msg assistant'}
          >
            <span className="ai-msg-role">{message.role === 'user' ? 'You' : 'AI'}</span>
            <p>{message.text || '…'}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="ai-chat-error" role="alert">
          <AlertTriangle size={13} />
          <span>{error}</span>
          <button className="retry-button" onClick={() => submit(lastPrompt, true)}>
            Retry
          </button>
        </div>
      )}

      <div className="ai-chat-input">
        <input
          value={input}
          placeholder={placeholder ?? 'Type a question…'}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit(input, false)
          }}
        />
        {streaming ? (
          <button className="stop-button" onClick={stop}>
            <Square size={12} /> Stop
          </button>
        ) : (
          <button className="primary-button" onClick={() => submit(input, false)}>
            <Send size={14} /> Send
          </button>
        )}
      </div>
    </div>
  )
}
