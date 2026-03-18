import type { Address, Hex } from 'ox'
import { encodeFunctionData } from 'viem'
import { Abis } from 'viem/tempo'
import { describe, expect, it, vi } from 'vitest'
import { buildTxOnlyTransactions } from '#lib/server/build-tx-only-transactions'

vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({}),
}))

vi.mock('wagmi/tempo', () => ({
	Actions: {
		token: {
			getMetadata: vi.fn().mockResolvedValue({
				name: 'Mock Token',
				symbol: 'MCK',
				decimals: 18,
			}),
		},
	},
}))

const TRANSFER_EVENT_TOPIC0 =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex.Hex

function addressToTopic(address: Address.Address): Hex.Hex {
	return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}` as Hex.Hex
}

function toUint256Data(value: bigint): Hex.Hex {
	return `0x${value.toString(16).padStart(64, '0')}` as Hex.Hex
}

describe('buildTxOnlyTransactions', () => {
	it('parses known events from joined logs', async () => {
		const account =
			'0x1111111111111111111111111111111111111111' as Address.Address
		const recipient =
			'0x2222222222222222222222222222222222222222' as Address.Address
		const token =
			'0x20c0000000000000000000000000000000000000' as Address.Address
		const txHash = `0x${'a'.repeat(64)}` as Hex.Hex

		const result = await buildTxOnlyTransactions({
			address: account,
			hashes: [
				{
					hash: txHash,
					block_num: 10n,
					from: account,
					to: token,
					value: 0n,
				},
			],
			txRows: [
				{
					hash: txHash,
					block_num: 10n,
					block_timestamp: 100,
					from: account,
					to: token,
					value: 0n,
					input: '0x',
					calls: null,
				},
			],
			receiptRows: [
				{
					tx_hash: txHash,
					block_num: 10n,
					block_timestamp: 100,
					from: account,
					to: token,
					status: 1,
					gas_used: 21_000n,
					effective_gas_price: 2n,
				},
			],
			logRows: [
				{
					tx_hash: txHash,
					block_num: 10n,
					tx_idx: 0,
					log_idx: 0,
					address: token,
					topic0: TRANSFER_EVENT_TOPIC0,
					topic1: addressToTopic(account),
					topic2: addressToTopic(recipient),
					topic3: null,
					data: toUint256Data(5n),
				},
			],
		})

		expect(result).toHaveLength(1)
		expect(result[0]?.knownEvents.length).toBeGreaterThan(0)
		expect(result[0]?.knownEvents[0]?.type).toBe('send')
	})

	it('decodes TIP-20 mint call when logs are missing', async () => {
		const account =
			'0x1111111111111111111111111111111111111111' as Address.Address
		const recipient =
			'0x2222222222222222222222222222222222222222' as Address.Address
		const token =
			'0x20c0000000000000000000000000000000000000' as Address.Address
		const txHash = `0x${'b'.repeat(64)}` as Hex.Hex

		const result = await buildTxOnlyTransactions({
			address: account,
			hashes: [
				{
					hash: txHash,
					block_num: 12n,
					from: account,
					to: token,
					value: 0n,
				},
			],
			txRows: [
				{
					hash: txHash,
					block_num: 12n,
					block_timestamp: 120,
					from: account,
					to: token,
					value: 0n,
					input: encodeFunctionData({
						abi: Abis.tip20,
						functionName: 'mint',
						args: [recipient, 8n],
					}),
					calls: null,
				},
			],
			receiptRows: [
				{
					tx_hash: txHash,
					block_num: 12n,
					block_timestamp: 120,
					from: account,
					to: token,
					status: 1,
					gas_used: 21_000n,
					effective_gas_price: 2n,
				},
			],
			logRows: [],
		})

		expect(result).toHaveLength(1)
		expect(result[0]?.knownEvents.length).toBeGreaterThan(0)
		expect(result[0]?.knownEvents[0]?.type).toBe('mint')
		expect(result[0]?.knownEvents[0]?.parts[0]).toEqual({
			type: 'action',
			value: 'Mint to Recipient',
		})
	})
})
