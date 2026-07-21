import { describe, expect, it } from 'vitest'
import { shouldRetryQuery } from '../src/lib/query-retry'

describe('shouldRetryQuery', () => {
	it.each([
		'402 Payment Required',
		'Status: 403',
		'Request failed with status: 429',
	])('does not retry non-retryable upstream errors: %s', (message) => {
		expect(shouldRetryQuery(0, new Error(message))).toBe(false)
	})

	it('retries other failures at most twice', () => {
		expect(shouldRetryQuery(0, new Error('upstream unavailable'))).toBe(true)
		expect(shouldRetryQuery(1, new Error('upstream unavailable'))).toBe(true)
		expect(shouldRetryQuery(2, new Error('upstream unavailable'))).toBe(false)
	})
})
