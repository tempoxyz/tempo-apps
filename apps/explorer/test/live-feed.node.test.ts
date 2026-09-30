import { describe, expect, it } from 'vitest'
import { liveFeedSecondsLeft } from '../src/lib/live-feed'

describe('bounded live feed', () => {
	const session = { scope: 'address:transfers:1', deadline: 120_000 }
	it('is off until explicitly started', () => {
		expect(liveFeedSecondsLeft(null, session.scope, true, 0)).toBe(0)
	})
	it('expires after two minutes, including after a suspended timer', () => {
		expect(liveFeedSecondsLeft(session, session.scope, true, 0)).toBe(120)
		expect(liveFeedSecondsLeft(session, session.scope, true, 119_001)).toBe(1)
		expect(liveFeedSecondsLeft(session, session.scope, true, 120_000)).toBe(0)
		expect(liveFeedSecondsLeft(session, session.scope, true, 180_000)).toBe(0)
	})
	it('stops when the address, tab, page, or filters change', () => {
		expect(
			liveFeedSecondsLeft(session, 'address:transactions:1', true, 1000),
		).toBe(0)
		expect(liveFeedSecondsLeft(session, session.scope, false, 1000)).toBe(0)
	})
})
