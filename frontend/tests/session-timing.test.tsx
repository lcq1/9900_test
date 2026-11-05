import { describe, expect, it } from 'vitest'
import { eventEpoch, formatSessionDuration, sessionTiming } from '../src/researcher/sessionTiming'
import type { ParticipantEvent } from '../src/participant/EventQueue'

const event = (seq: number, type: ParticipantEvent['type'], timestamp: string, detail?: Record<string, unknown>): ParticipantEvent =>
    ({ seq, type, timestamp, epochMs: Date.parse(timestamp), perfMs: 0, detail })

describe('recorded session time', () => {
    it('excludes both exited intervals in the three-visit P02 regression while retaining the real span', () => {
        const events = [
            event(0, 'stage_view', '2026-11-04T05:30:07.641Z'),
            event(38, 'abort', '2026-11-04T05:30:56.422Z'),
            event(40, 'recording_stop', '2026-11-04T05:30:56.476Z'),
            event(41, 'stage_view', '2026-11-05T21:59:53.476Z'),
            event(77, 'abort', '2026-11-05T22:00:49.083Z'),
            event(79, 'recording_stop', '2026-11-05T22:00:49.158Z'),
            event(80, 'stage_view', '2026-11-05T22:11:58.219Z'),
            event(333, 'navigation', '2026-11-05T22:17:49.818Z'),
        ]
        expect(sessionTiming(events)).toEqual({ recordedMs: 455987, spanMs: 146862177, visits: 3, excludedMs: 146406190 })
        expect(formatSessionDuration(sessionTiming(events).recordedMs)).toBe('7m 36s')
        expect(formatSessionDuration(sessionTiming(events).spanMs)).toBe('1d 16h 47m 42s')
    })
    it('excludes explicit pauses without treating a resume as a new visit', () => {
        const events = [event(0, 'stage_view', '2026-11-06T00:00:00Z'), event(1, 'pause', '2026-11-06T00:00:10Z'),
            event(2, 'progress_checkpoint', '2026-11-06T00:30:00Z'), event(3, 'resume', '2026-11-06T01:00:00Z'), event(4, 'answer', '2026-11-06T01:00:20Z')]
        expect(sessionTiming(events).recordedMs).toBe(30000)
        expect(sessionTiming(events).visits).toBe(1)
    })
    it('does not arbitrarily trim a long silent reading interval', () => {
        expect(sessionTiming([event(0, 'stage_view', '2026-11-06T00:00:00Z'), event(1, 'answer', '2026-11-06T02:00:00Z')]).recordedMs).toBe(7200000)
    })
    it('uses explicit new-visit markers after a browser closes without Abort', () => {
        const events = [event(0, 'stage_view', '2026-11-06T00:00:00Z', { visitStarted: true }), event(1, 'answer', '2026-11-06T00:00:10Z'),
            event(2, 'stage_view', '2026-11-06T01:00:00Z', { visitStarted: true }), event(3, 'answer', '2026-11-06T01:00:20Z')]
        expect(sessionTiming(events).recordedMs).toBe(30000)
        expect(sessionTiming(events).visits).toBe(2)
    })
    it('normalizes server timestamps but never counts delayed file writes as participant time', () => {
        const media = { ...event(3, 'recording_media', '2026-11-06T04:00:00Z'), epochMs: 0 }
        expect(eventEpoch(media)).toBe(Date.parse(media.timestamp))
        expect(sessionTiming([media, event(0, 'stage_view', '2026-11-06T00:00:00Z'), event(1, 'abort', '2026-11-06T00:01:00Z')]).recordedMs).toBe(60000)
        expect(sessionTiming([]).recordedMs).toBe(0)
    })
})
