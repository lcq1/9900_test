/** Consent text, signature pad and explicit acceptance checkbox. */
import {
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from 'react'

import { CalendarDays, PenLine } from 'lucide-react'

export interface ConsentViewProps {
	text: string[]
	onConsent: (signatureDataUrl: string, accepted?: boolean) => void
	signingMethod?: 'handwritten' | 'name'
	clauses?: string[]
	initialValue?: string
	confirmLabel?: string
}

export function ConsentView({
	text,
	onConsent,
	signingMethod,
	clauses = [],
	initialValue,
	confirmLabel = 'I consent and want to continue',
}: ConsentViewProps) {
	const [restoredConsent] = useState(() => {
 try { return initialValue && signingMethod === 'name' ? JSON.parse(initialValue) as { name: string; readToEnd: boolean; clauses: { text: string; accepted: boolean }[] } : null } catch { return null }
})
	const documentRef = useRef<HTMLDivElement>(null)
	const [read, setRead] = useState(restoredConsent?.readToEnd ?? false)
	const [name, setName] = useState(restoredConsent?.name ?? '')
	const [checks, setChecks] = useState<boolean[]>(clauses.map((text, i) => restoredConsent?.clauses?.[i]?.text === text && restoredConsent.clauses[i].accepted))
	useEffect(() => {
		const check = () => { const el = documentRef.current; if (el && el.scrollHeight <= el.clientHeight + 2) setRead(true) }
		check(); window.addEventListener('resize', check)
		return () => window.removeEventListener('resize', check)
	}, [])
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const drawingRef = useRef(false)
	const [hasSignature, setHasSignature] = useState(false)
	const [consented, setConsented] = useState(Boolean(restoredConsent?.name && clauses.length && clauses.every((text, i) => restoredConsent.clauses?.[i]?.text === text && restoredConsent.clauses[i].accepted)))

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const context = canvas.getContext('2d')
		if (!context) return
		context.lineWidth = 2
		context.lineCap = 'round'
		context.strokeStyle = '#1f5f9e'
	}, [])

	const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current
		if (!canvas) return { x: 0, y: 0 }
		const rect = canvas.getBoundingClientRect()
		return {
			x:
				((event.clientX - rect.left) * canvas.width) /
				Math.max(1, rect.width),
			y:
				((event.clientY - rect.top) * canvas.height) /
				Math.max(1, rect.height),
		}
	}

	const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const context = canvasRef.current?.getContext('2d')
		if (!context) return
		drawingRef.current = true
		const { x, y } = pointFromEvent(event)
		context.beginPath()
		context.moveTo(x, y)
	}

	const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		if (!drawingRef.current) return
		const context = canvasRef.current?.getContext('2d')
		if (!context) return
		const { x, y } = pointFromEvent(event)
		context.lineTo(x, y)
		context.stroke()
		if (!hasSignature) setHasSignature(true)
	}

	const endDraw = () => {
		if (
			drawingRef.current &&
			hasSignature &&
			consented &&
			canvasRef.current
		) {
			onConsent(canvasRef.current.toDataURL('image/png'), true)
		}
		drawingRef.current = false
	}

	const clearSignature = () => {
		const canvas = canvasRef.current
		const context = canvas?.getContext('2d')
		if (canvas && context) {
			context.clearRect(0, 0, canvas.width, canvas.height)
		}
		setHasSignature(false)
		onConsent('', false)
	}

	const handleConsent = (accepted: boolean) => {
		const dataUrl =
			accepted && canvasRef.current
				? canvasRef.current.toDataURL('image/png')
				: ''
		setConsented(accepted)
		onConsent(dataUrl, accepted && hasSignature)
	}

	if (signingMethod === 'name') return <div className="consent-view consent-columns">
<div className="consent-document" ref={documentRef} tabIndex={0} aria-label="Consent document" onScroll={event => { const el = event.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) setRead(true) }}>{text.map((line, i) => <p key={i}>{line}</p>)}</div>
<div className="consent-signing"><h2>Consent signature</h2><p>Scroll through the full document before signing.</p>{clauses.map((clause, i) => <label className="consent-confirm" key={i}><input type="checkbox" checked={checks[i] ?? false} onChange={event => { const next = [...checks]; next[i] = event.target.checked; setChecks(next); setConsented(false); onConsent('', false) }} />{clause}</label>)}<label>Full legal name<input value={name} onChange={event => { setName(event.target.value); setConsented(false); onConsent('', false) }} /></label><div className="consent-signing-actions"><p className="consent-date"><CalendarDays size={14} aria-hidden="true" /><span>Date: {new Date().toLocaleDateString('en-AU')}</span></p><button className="primary-button" disabled={consented || !read || !name.trim() || !clauses.length || !clauses.every((_, i) => checks[i])} onClick={() => { onConsent(JSON.stringify({ method: 'name', name: name.trim(), clauses: clauses.map((text, i) => ({ text, accepted: checks[i] })), signedAt: new Date().toISOString(), document: text, readToEnd: read }), true); setConsented(true) }}>{consented ? '✓ Consent confirmed' : 'Sign consent and continue'}</button></div><p role="status" className={consented ? 'consent-recorded' : undefined}>{consented ? 'Consent confirmed. Select Next stage to continue.' : read ? 'Document read.' : 'Scroll to the end of the document.'}</p></div></div>
	return (
		<div className="consent-view">
			{text.map((line, index) => (
				<p className="consent-line" key={index}>
					{line}
				</p>
			))}

			<div className="consent-signature">
				<div className="consent-signature-head">
					<span>
						<PenLine size={15} /> Signature
					</span>
					{hasSignature && (
						<button
							type="button"
							className="consent-clear"
							onClick={clearSignature}
						>
							Clear
						</button>
					)}
				</div>
				<canvas
					ref={canvasRef}
					width={520}
					height={140}
					className="consent-canvas"
					onPointerDown={startDraw}
					onPointerMove={draw}
					onPointerUp={endDraw}
					onPointerLeave={endDraw}
				/>
				<small className="consent-signature-hint">
					Draw your signature above to acknowledge consent.
				</small>
			</div>

			<label className="consent-confirm">
				<input
					type="checkbox"
					checked={consented}
					onChange={(event) => handleConsent(event.target.checked)}
				/>
				<span>{confirmLabel}</span>
			</label>
			{consented && hasSignature && (
				<p className="consent-recorded">Consent recorded.</p>
			)}
		</div>
	)
}
