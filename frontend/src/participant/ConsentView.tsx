/**
 * ConsentView.tsx — consent stage: instructional copy + signature pad + confirm.
 *
 * Renders the consent body text, a canvas the participant draws their signature
 * on, and an "I consent" button that captures the signature as a data URL and
 * advances the flow via `onConsent`.
 */
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Check, PenLine } from 'lucide-react'

export interface ConsentViewProps {
  text: string[]
  onConsent: (signatureDataUrl: string) => void
  confirmLabel?: string
}

export function ConsentView({
  text,
  onConsent,
  confirmLabel = 'I consent and want to continue',
}: ConsentViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [consented, setConsented] = useState(false)

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
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
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
    drawingRef.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
    setHasSignature(false)
  }

  const handleConsent = () => {
    const dataUrl = canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''
    setConsented(true)
    onConsent(dataUrl)
  }

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
            <button type="button" className="consent-clear" onClick={clearSignature}>
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

      <button
        className="primary-button consent-confirm"
        onClick={handleConsent}
        disabled={!hasSignature}
      >
        <Check size={15} /> {confirmLabel}
      </button>
      {consented && <p className="consent-recorded">Consent recorded.</p>}
    </div>
  )
}
