import { describe, expect, test } from 'vitest'
import { getRpcAuthorizationHeader } from '../src/lib/rpc.js'

describe('getRpcAuthorizationHeader', () => {
	test('encodes configured RPC credentials as Basic Auth', () => {
		const credentials = 'fee-payer:test-api-key'

		expect(getRpcAuthorizationHeader({ TEMPO_RPC_AUTH: credentials })).toBe(
			`Basic ${btoa(credentials)}`,
		)
	})

	test('does not authenticate when credentials are missing', () => {
		expect(getRpcAuthorizationHeader({})).toBeUndefined()
	})
})
