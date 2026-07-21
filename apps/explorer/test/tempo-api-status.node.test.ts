import { describe, expect, it } from 'vitest'
import { isAlertableTempoApiStatus } from '../src/lib/server/tempo-api'

describe('isAlertableTempoApiStatus', () => {
	it.each([402, 403, 429, 500, 503])('alerts for status %i', (status) => {
		expect(isAlertableTempoApiStatus(status)).toBe(true)
	})

	it.each([200, 400, 401, 404])('does not alert for status %i', (status) => {
		expect(isAlertableTempoApiStatus(status)).toBe(false)
	})
})
