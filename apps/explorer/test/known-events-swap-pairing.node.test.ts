import { describe, expect, it } from 'vitest'
import type * as Hex from 'ox/Hex'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { Addresses } from 'viem/tempo'
import { Abis, stablecoinDexAbi } from '#lib/abis'
import {
	accountAddress,
	mockLog,
	mockReceipt,
	recipientAddress,
} from '#lib/demo'
import { parseKnownEvents } from '#lib/domain/known-events'

describe('parseKnownEvents swap pairing', () => {
	// Workers freeze the clock during synchronous work, so this timing check
	// runs under Node.
	it('stays linear in the number of transfers into the Stablecoin DEX', () => {
		const hash = `0x${'6'.repeat(64)}` as const
		const OUSD = '0x20c0000000000000000000006a37da5c996874be' as const
		const USDC = '0x20c000000000000000000000b9537d11c60e8b50' as const
		const dex = Addresses.stablecoinDex
		const transfer = (
			token: Hex.Hex,
			from: Hex.Hex,
			to: Hex.Hex,
			amount: bigint,
		) =>
			mockLog(
				{
					address: token,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from, to },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			)
		const fill = mockLog(
			{
				address: dex,
				topics: encodeEventTopics({
					abi: stablecoinDexAbi,
					eventName: 'OrderFilled',
					args: { orderId: 1n, maker: recipientAddress, taker: accountAddress },
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters(
					[{ type: 'uint128' }, { type: 'bool' }],
					[1n, true],
				),
			},
			hash,
		)
		const count = 5_000
		const receipt = mockReceipt(
			[
				...Array.from({ length: count }, (_, index) =>
					transfer(OUSD, accountAddress, dex, BigInt(index + 1)),
				),
				fill,
				transfer(USDC, dex, accountAddress, 1n),
			],
			accountAddress,
			hash,
		)

		const start = performance.now()
		const swaps = parseKnownEvents(receipt).filter(
			(event) => event.type === 'swap',
		)
		const elapsed = performance.now() - start

		expect(swaps).toHaveLength(count)
		expect(
			swaps.every((swap) =>
				swap.parts.some((part) => part.type === 'dexRoute'),
			),
		).toBe(true)
		expect(elapsed).toBeLessThan(2_000)
	})
})
