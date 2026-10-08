import { describe, expect, it } from 'vitest'
import { resolveTempoEnv } from '../src/lib/env'

describe('preview chain selection', () => {
	it('keeps preview names containing mainnet, testnet and devnet on the configured chain', () => {
		for (const hostname of [
			'preview-explorer-mainnet-explorer.tail388b2e.ts.net',
			'explorer-testnet.local',
			'explorer-devnet.local',
			undefined,
		])
			expect(resolveTempoEnv(hostname, 'preview')).toBe('preview')
	})
	it('preserves hostname selection and the fallback for standard deployments', () => {
		expect(resolveTempoEnv('explore.tempo.xyz', 'testnet')).toBe('mainnet')
		expect(resolveTempoEnv('localhost', 'nextfork')).toBe('nextfork')
		expect(resolveTempoEnv(undefined, undefined)).toBe('testnet')
	})
})
