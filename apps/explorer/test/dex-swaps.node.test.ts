import { describe, expect, it } from 'vitest'
import type { Address, Hex } from 'viem'
import { Addresses } from 'viem/tempo'
import { fillHop, groupSwaps, orderAt, quoteAt } from '#lib/dex-swaps'

const USDC = '0x20c000000000000000000000b9537d11c60e8b50'
const OUSD = '0x20c0000000000000000000006a37da5c996874be'
const PATH = Addresses.pathUsd
const TAKER = '0x09ad820a00000000000000000000000000b024fa' as Address
const TX = `0x${'1'.repeat(64)}` as Hex

describe('Stablecoin DEX swaps', () => {
	it('uses the order side from its latest placement or flip before a fill', () => {
		const placed = { block: 10, log: 0, token: USDC, isBid: true, tick: -10 }
		const flipped = { block: 20, log: 4, token: USDC, isBid: false, tick: 0 }
		expect(orderAt([placed, flipped], { block: 15, log: 0 })).toBe(placed)
		// The fill that triggers a flip comes before the flip in the same block.
		expect(orderAt([placed, flipped], { block: 20, log: 3 })).toBe(placed)
		expect(orderAt([placed, flipped], { block: 21, log: 0 })).toBe(flipped)
		expect(orderAt([placed], { block: 5, log: 0 })).toBeUndefined()
	})

	it('prices fills at the tick from the taker’s side', () => {
		const quote = { address: OUSD as Address, decimals: 6 }
		expect(
			fillHop(1_000_000n, { token: USDC, isBid: true, tick: -10 }, quote, 6),
		).toEqual({
			from: USDC,
			to: OUSD,
			amountIn: 1_000_000n,
			amountOut: 999_900n,
		})
		expect(
			fillHop(1_000_000n, { token: USDC, isBid: false, tick: 20 }, quote, 6),
		).toEqual({
			from: OUSD,
			to: USDC,
			amountIn: 1_000_200n,
			amountOut: 1_000_000n,
		})
	})

	it('quotes a base in the token it routed through at the time', () => {
		const switches = [{ quote: OUSD as Address, at: 1_000 }]
		expect(quoteAt(switches, PATH, 999)).toBe(PATH)
		expect(quoteAt(switches, PATH, 1_000)).toBe(OUSD)
	})

	it('chains routed hops into one swap and keeps round trips apart', () => {
		const hop = (
			from: Address,
			to: Address,
			log: number,
			transactionHash: Hex = TX,
		) => ({
			from,
			to,
			amountIn: 2_000_000n,
			amountOut: 1_999_000n,
			transactionHash,
			taker: TAKER,
			timestamp: 100,
			log,
		})
		const second = {
			...hop(OUSD, USDC, 5),
			amountIn: 1_999_000n,
			amountOut: 1_998_000n,
		}
		expect(groupSwaps([second, hop(PATH, OUSD, 3)])).toEqual([
			{
				id: `${TX}-3`,
				transactionHash: TX,
				taker: TAKER,
				timestamp: 100,
				from: PATH,
				to: USDC,
				amountIn: 2_000_000n,
				amountOut: 1_998_000n,
			},
		])
		// Separate trades whose middle amounts differ are not one route.
		const separate = groupSwaps([
			hop(PATH, OUSD, 1),
			{ ...hop(OUSD, USDC, 2), amountIn: 500_000n, amountOut: 499_000n },
		])
		expect(separate.map((swap) => [swap.from, swap.to])).toEqual([
			[PATH, OUSD],
			[OUSD, USDC],
		])
		const roundTrip = groupSwaps([hop(PATH, OUSD, 1), hop(OUSD, PATH, 2)])
		expect(roundTrip.map((swap) => [swap.from, swap.to])).toEqual([
			[PATH, OUSD],
			[OUSD, PATH],
		])
	})
})
