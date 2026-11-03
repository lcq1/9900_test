import { useTransientNotice } from './TimerController'/**
 * AIChat.tsx — participant AI assistant panel (text-only).
 *
 * Talks only to the application backend and renders the
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
import { LlmCallError, getAIConfig, streamChat } from '../api/participant'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface AIChatProps {
	initialConversationId?: string
	initialMessages?: ChatMessage[]
	disabled?: boolean
	stageId: string
	getSessionId?: () => Promise<string>
	onFailure?: (message: string, partialText: string) => void
	/** Short label describing the stage context, shown in the header. */
	contextLabel?: string
	placeholder?: string
	/** Called with the participant's message so the host can log it to EventQueue. */
	onUserMessage?: (text: string) => void
	/** Called with the final assistant reply so callers can log it to EventQueue. */
	onAssistantReply?: (text: string) => void
}

export function AIChat({
	disabled = false,
	initialConversationId,
	initialMessages,
	stageId,
	getSessionId,
	onFailure,
	contextLabel,
	placeholder,
	onUserMessage,
	onAssistantReply,
}: AIChatProps) {
	const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? [])
	const [input, setInput] = useState('')
	const [streaming, setStreaming] = useState(false)
	const [modelLabel, setModelLabel] = useState('')
	const [error, setError, errorVisible, errorRevision] =
		useTransientNotice('')
	const [lastPrompt, setLastPrompt] = useState('')
	const scrollRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const composingRef = useRef(false)
	useEffect(() => {
		const field = inputRef.current
		if (field) {
			field.style.height = 'auto'
			field.style.height = `${Math.min(192, Math.max(64, field.scrollHeight))}px`
		}
	}, [input])
	const abortRef = useRef<AbortController | null>(null)
	const streamingRef = useRef(false)
	useEffect(() => {
		if (disabled) abortRef.current?.abort()
	}, [disabled])
	const [conversationId] = useState(() => initialConversationId ?? crypto.randomUUID())
	const requestIdRef = useRef('')

	useEffect(() => {
		let active = true
		getAIConfig()
			.then((config) => {
				if (!active) return
				setModelLabel(config.model)
				if (!config.configured)
					setError(
						'The AI provider is not configured. Please contact the researcher.',
					)
			})
			.catch(() => {
				if (active)
					setError(
						'Could not load AI settings from the study server. Please retry.',
					)
			})
		return () => {
			active = false
		}
	}, [setError])

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
		if (disabled || !text || streamingRef.current) return

		const retryIndex = messages.findLastIndex(
			(message) => message.role === 'user',
		)
		const base =
			isRetry && retryIndex >= 0
				? messages.slice(0, retryIndex)
				: messages

		if (!isRetry || !requestIdRef.current)
			requestIdRef.current = crypto.randomUUID()

		const assistantId = `a-${Date.now()}`
		const nextMessages = [
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
				sessionId: await getSessionId?.(),
				stageId,
				conversationId,
				requestId: requestIdRef.current,
				onModel: setModelLabel,
				signal: controller.signal,
				onDelta: (delta) => {
					received += delta
					setMessages((current) =>
						current.map((message) =>
							message.id === assistantId
								? { ...message, text: received }
								: message,
						),
					)
				},
			})
			if (result.aborted)
				onFailure?.('AI request interrupted', result.text)
			else if (result.text) onAssistantReply?.(result.text)
		} catch (caught) {
			onFailure?.(
				caught instanceof Error ? caught.message : 'AI request failed',
				received,
			)
			if (caught instanceof LlmCallError) {
				if (!received) {
					setMessages((current) =>
						current.filter((message) => message.id !== assistantId),
					)
				}
				setError(caught.message)
			} else if (!(
				caught instanceof Error && caught.name === 'AbortError'
			)) {
				setError(
					'The AI service could not be reached. Check your connection and retry.',
				)
			}
		} finally {
			abortRef.current = null
			streamingRef.current = false
			setStreaming(false)
		}
	}

	const stop = () => abortRef.current?.abort()

	// The backend selects the model; this label only displays its response.

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
						Ask the assistant about your task. Responses are
						text-only and timestamped.
					</p>
				)}
				{messages.map((message) => (
					<div
						key={message.id}
						className={
							message.role === 'user'
								? 'ai-msg user'
								: 'ai-msg assistant'
						}
					>
						<span className="ai-msg-role">
							{message.role === 'user' ? 'You' : 'AI'}
						</span>
						<p>{message.text || '…'}</p>
					</div>
				))}
			</div>

			{error && errorVisible && (
				<div
					key={errorRevision}
					className="ai-chat-error transient-notice"
					role="alert"
				>
					<AlertTriangle size={13} />
					<span>{error}</span>
					<button
						className="retry-button"
						disabled={disabled}
						onClick={() => submit(lastPrompt, true)}
					>
						Retry
					</button>
				</div>
			)}

			{error && !errorVisible && (
				<button
					className="retry-button"
					disabled={disabled}
					onClick={() => submit(lastPrompt, true)}
				>
					Retry last AI request
				</button>
			)}
			<div className="ai-chat-input">
				<textarea
					ref={inputRef}
					rows={2}
					aria-label="AI message"
					disabled={disabled}
					onCompositionStart={() => {
						composingRef.current = true
					}}
					onCompositionEnd={() => {
						composingRef.current = false
					}}
					value={input}
					placeholder={placeholder ?? 'Type a question…'}
					onChange={(event) => setInput(event.target.value)}
					onKeyDown={(event) => {
						if (
							event.key === 'Enter' &&
							!event.shiftKey &&
							!composingRef.current &&
							!event.nativeEvent.isComposing &&
							event.keyCode !== 229
						) {
							event.preventDefault()
							void submit(input, false)
						}
					}}
				/>
				{streaming ? (
					<button className="stop-button" onClick={stop}>
						<Square size={12} /> Stop
					</button>
				) : (
					<button
						className="primary-button"
						disabled={disabled}
						onClick={() => submit(input, false)}
					>
						<Send size={14} /> Send
					</button>
				)}
			</div>
		</div>
	)
}
