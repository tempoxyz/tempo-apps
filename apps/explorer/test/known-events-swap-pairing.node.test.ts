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

const hash = `0x${'6'.repeat(64)}` as const
const OUSD = '0x20c0000000000000000000006a37da5c996874be' as const
const USDC = '0x20c000000000000000000000b9537d11c60e8b50' as const
const dex = Addresses.stablecoinDex

const transfer = (token: Hex.Hex, from: Hex.Hex, to: Hex.Hex, amount: bigint) =>
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

const fill = (extra: object = {}, taker: Hex.Hex = accountAddress) =>
	mockLog(
		{
			address: dex,
			topics: encodeEventTopics({
				abi: stablecoinDexAbi,
				eventName: 'OrderFilled',
				args: { orderId: 1n, maker: recipientAddress, taker },
			}) as [Hex.Hex, ...Hex.Hex[]],
			data: encodeAbiParameters(
				[{ type: 'uint128' }, { type: 'bool' }],
				[1n, true],
			),
			...extra,
		},
		hash,
	)

const swaps = (logs: ReturnType<typeof mockLog>[]) =>
	parseKnownEvents(mockReceipt(logs, accountAddress, hash)).filter(
		(event) => event.type === 'swap',
	)

// Swap pairing is a pure function, so these run under Node, where CI runs
// them and the clock advances during synchronous work.
describe('parseKnownEvents swap pairing', () => {
	it('pairs each transfer into the Stablecoin DEX with the next one out of it', () => {
		const amounts = swaps([
			transfer(OUSD, accountAddress, dex, 1n),
			transfer(OUSD, accountAddress, recipientAddress, 2n),
			transfer(OUSD, accountAddress, dex, 3n),
			transfer(USDC, dex, accountAddress, 4n),
			transfer(OUSD, accountAddress, dex, 5n),
			transfer(USDC, dex, accountAddress, 6n),
			transfer(OUSD, accountAddress, dex, 7n),
		]).map((event) =>
			event.parts.flatMap((part) =>
				part.type === 'amount' ? [part.value.value] : [],
			),
		)

		expect(amounts).toEqual([
			[1n, 4n],
			[3n, 4n],
			[5n, 6n],
		])
	})

	it('ignores an OrderFilled log without a taker', () => {
		const parsed = swaps([
			transfer(OUSD, accountAddress, dex, 1n),
			fill({ args: {} }),
			transfer(USDC, dex, accountAddress, 1n),
		])

		expect(parsed).toHaveLength(1)
		expect(parsed[0]?.parts.some((part) => part.type === 'dexRoute')).toBe(
			false,
		)
	})

	it('stays linear in the number of transfers into the Stablecoin DEX', () => {
		// Every transfer in pairs with the one transfer out at the end, past
		// fills for another taker, so rescanning the logs per pair (for the
		// next transfer out or for the taker's fill) is quadratic.
		const receipt = (count: number) => [
			...Array.from({ length: count }, (_, index) =>
				transfer(OUSD, accountAddress, dex, BigInt(index + 1)),
			),
			...Array.from({ length: count }, () => fill({}, recipientAddress)),
			fill(),
			transfer(USDC, dex, accountAddress, 1n),
		]
		const time = (count: number) => {
			const logs = receipt(count)
			let best = Number.POSITIVE_INFINITY
			for (let run = 0; run < 3; run++) {
				const start = performance.now()
				const parsed = swaps(logs)
				best = Math.min(best, performance.now() - start)
				expect(parsed).toHaveLength(count)
				expect(
					parsed.every((swap) =>
						swap.parts.some((part) => part.type === 'dexRoute'),
					),
				).toBe(true)
			}
			return best
		}

		time(250)
		const small = time(1_000)
		const large = time(4_000)

		// Four times the transfers: about 4x when linear, about 16x when
		// quadratic. Compare the two runs so host speed cancels out.
		expect(large / small).toBeLessThan(8)
	})
})
