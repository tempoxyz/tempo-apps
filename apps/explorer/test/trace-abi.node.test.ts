import { describe, expect, it } from 'vitest'
import { getKnownTraceAbiItem } from '#lib/domain/trace-abi'

describe('known trace ABI selectors', () => {
	it('labels the canonical encrypted Zone deposit entrypoint', () => {
		expect(getKnownTraceAbiItem('0x03dd6f34')).toMatchObject({
			name: 'deposit',
		})
	})

	it('labels encrypted deposits from legacy Zone Portal deployments', () => {
		expect(getKnownTraceAbiItem('0xb01f22e4')).toMatchObject({
			name: 'depositEncrypted',
		})
	})

	it('keeps ERC-20 selector decoding', () => {
		expect(getKnownTraceAbiItem('0x095ea7b3')).toMatchObject({
			name: 'approve',
		})
	})
})
