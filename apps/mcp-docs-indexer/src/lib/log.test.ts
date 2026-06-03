import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from './log.js'

const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
	infoSpy.mockClear()
	warnSpy.mockClear()
	errorSpy.mockClear()
})

afterEach(() => {
	vi.useRealTimers()
})

/**
 * Each log call is `console.<level>(event, payload)`:
 *   - first arg is the event string (used by Workers Logs for the inline
 *     timeline summary)
 *   - second arg is the structured payload object (indexed as searchable
 *     properties)
 */
function callOf(spy: typeof infoSpy): {
	event: string
	payload: Record<string, unknown>
} {
	const args = spy.mock.calls[0]
	expect(args).toBeDefined()
	const [event, payload] = args as [string, Record<string, unknown>]
	expect(typeof event).toBe('string')
	expect(typeof payload).toBe('object')
	return { event, payload }
}

describe('log', () => {
	it('emits info with the event string and a structured payload', () => {
		log.info('cron.start', { sources: 4 })
		expect(infoSpy).toHaveBeenCalledTimes(1)
		const { event, payload } = callOf(infoSpy)
		expect(event).toBe('cron.start')
		expect(payload).toMatchObject({
			level: 'info',
			logger: 'mcp-docs-indexer',
			event: 'cron.start',
			sources: 4,
		})
		expect(typeof payload.timestamp).toBe('string')
	})

	it('routes warn through console.warn', () => {
		log.warn('page.empty', { url: 'https://x/y' })
		expect(warnSpy).toHaveBeenCalledTimes(1)
		expect(callOf(warnSpy).payload.level).toBe('warn')
	})

	it('routes error through console.error', () => {
		log.error('source.failed', { source: 'viem', error: 'oops' })
		expect(errorSpy).toHaveBeenCalledTimes(1)
		const { event, payload } = callOf(errorSpy)
		expect(event).toBe('source.failed')
		expect(payload).toMatchObject({
			level: 'error',
			event: 'source.failed',
			source: 'viem',
			error: 'oops',
		})
	})
})
