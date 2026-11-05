import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

/** A horizontally scrollable stage list; scroll controls never change stage. */
export function StageNavigation({ currentStep, total, children }: {
 currentStep: number
 total: number
 children: ReactNode
}) {
 const list = useRef<HTMLDivElement>(null)
 const [scrollable, setScrollable] = useState({ left: false, right: false })
 useEffect(() => {
  const element = list.current
  if (!element) return
  let active = true
  const update = () => {
   if (!active) return
   const next = { left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 }
   setScrollable(previous => previous.left === next.left && previous.right === next.right ? previous : next)
  }
  const revealCurrent = () => {
   const selected = element.querySelector<HTMLElement>('[aria-current="step"]')
   if (selected) {
    const container = element.getBoundingClientRect(), item = selected.getBoundingClientRect()
    if (item.left < container.left || item.right > container.right) {
     element.scrollLeft += item.left - container.left - (element.clientWidth - item.width) / 2
    }
   }
   update()
  }
  const timer = window.setTimeout(revealCurrent, 0)
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealCurrent)
  observer?.observe(element)
  element.addEventListener('scroll', update, { passive: true })
  return () => { active = false; window.clearTimeout(timer); observer?.disconnect(); element.removeEventListener('scroll', update) }
 }, [currentStep, total])
 return <nav className="question-nav-panel" aria-label="Study progress">
  <div className="stage-navigation-heading">
   <div className="question-nav-title">Study stages <span>{currentStep} / {total}</span></div>
   {(scrollable.left || scrollable.right) && <div className="stage-navigation-controls">
    <span>Scroll to see all stages</span>
    <button type="button" aria-label="Scroll stages left" disabled={!scrollable.left} onClick={() => list.current?.scrollBy({ left: -360, behavior: 'smooth' })}><ArrowLeft size={16} /></button>
    <button type="button" aria-label="Scroll stages right" disabled={!scrollable.right} onClick={() => list.current?.scrollBy({ left: 360, behavior: 'smooth' })}><ArrowRight size={16} /></button>
   </div>}
  </div>
  <div className="qnav-list" ref={list}>{children}</div>
 </nav>
}
