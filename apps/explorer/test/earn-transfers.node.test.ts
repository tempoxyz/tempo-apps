import { describe, expect, test, vi } from 'vitest'

const account = '0x6ea2af3b1e68848291122dd512d5e952073147a0'
const share = '0x20c000000000000000000000baac91f6ca72f768'
const vault = '0xd730394f3bb85a4828e35fc5e361dcc9f894fa4f'
const distributor = '0x53be019722acea7fff9091f15cb383b4e6dbb0c7'
const stranger = '0x00000000000000000000000000000000000000aa'

vi.mock('#lib/server/address-balances', () => ({
	fetchEarnPositions: async () => [
		{
			assetAmount: { amount: '28194864', currency: 'USD', decimals: 6 },
			shareAmount: { amount: '14053342', decimals: 6 },
			shareToken: { address: share },
			vaultAddress: vault,
		},
	],
}))

vi.mock('#wagmi.config.ts', () => ({
	getBatchedClient: () => ({
		readContract: async ({ address }: { address: string }) => {
			if (address === distributor) return vault
			throw new Error('execution reverted')
		},
	}),
}))

const { annotateEarnTransfers } = await import('#lib/server/earn-transfers')

describe('Earn transfers on the Transfers tab', () => {
	test('labels the distributor payout as interest and values shares at the vault rate', async () => {
		const [interest, gift, redemption] = await annotateEarnTransfers(
			account,
			4217,
			[
				{
					from: distributor,
					to: account,
					value: '1734',
					token: { address: share },
				},
				{
					from: stranger,
					to: account,
					value: '1000000',
					token: { address: share },
				},
				{
					from: account,
					to: vault,
					value: '249334',
					token: { address: share },
				},
			] as never,
		)
		expect(interest?.kind).toBe('earn-interest')
		expect(interest?.valuation).toEqual({
			value: '3478',
			currency: 'USD',
			decimals: 6,
		})
		// Shares from anyone else are not interest.
		expect(gift?.kind).toBeUndefined()
		expect(redemption?.kind).toBeUndefined()
		expect(redemption?.valuation?.value).toBe('500232')
	})
})
