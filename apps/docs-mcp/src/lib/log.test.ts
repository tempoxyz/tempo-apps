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

function parseLine(spy: typeof infoSpy): Record<string, unknown> {
	const arg = spy.mock.calls[0]?.[0]
	expect(typeof arg).toBe('string')
	return JSON.parse(arg as string)
}

describe('log', () => {
	it('emits info as a single JSON line via console.info', () => {
		log.info('cron.start', { sources: 4 })
		expect(infoSpy).toHaveBeenCalledTimes(1)
		const line = parseLine(infoSpy)
		expect(line).toMatchObject({
			level: 'info',
			logger: 'docs-mcp',
			event: 'cron.start',
			sources: 4,
		})
		expect(typeof line.timestamp).toBe('string')
	})

	it('routes warn through console.warn', () => {
		log.warn('page.empty', { url: 'https://x/y' })
		expect(warnSpy).toHaveBeenCalledTimes(1)
		expect(parseLine(warnSpy).level).toBe('warn')
	})

	it('routes error through console.error', () => {
		log.error('source.failed', { source: 'viem', error: 'oops' })
		expect(errorSpy).toHaveBeenCalledTimes(1)
		expect(parseLine(errorSpy)).toMatchObject({
			level: 'error',
			event: 'source.failed',
			source: 'viem',
			error: 'oops',
		})
	})
})
