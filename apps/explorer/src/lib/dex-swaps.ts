import type { Address, Hex } from 'viem'
import { append, type DexPoolToken } from '#lib/dex-pools'

export type DexSwap = {
	id: string
	transactionHash: Hex
	timestamp: number
	taker: Address
	from: DexPoolToken
	to: DexPoolToken
	amountIn: number
	amountOut: number
}

export type DexFill = {
	block: number
	log: number
	transactionHash: Hex
	timestamp: number
	orderId: string
	taker: Address
	amount: bigint
}

/** An order's base token, side and tick, from its placement or a flip. */
export type DexOrderState = {
	block: number
	log: number
	token: Address
	isBid: boolean
	tick: number
}

/** One fill from the taker's side, in each token's own units. */
export type DexHop = {
	from: Address
	to: Address
	amountIn: bigint
	amountOut: bigint
}

const before = (
	a: { block: number; log: number },
	b: { block: number; log: number },
) => a.block < b.block || (a.block === b.block && a.log < b.log)

/**
 * Flip orders keep their id and change side and tick when they flip, so a
 * fill matches the order's latest placement or flip before it.
 */
export function orderAt(
	states: readonly DexOrderState[],
	fill: { block: number; log: number },
): DexOrderState | undefined {
	let latest: DexOrderState | undefined
	for (const state of states)
		if (before(state, fill) && (!latest || before(latest, state)))
			latest = state
	return latest
}

/**
 * The quote a base routed through at a time: the newest switch at or before
 * it, otherwise the quote it had before its first switch.
 */
export function quoteAt(
	switches: readonly { quote: Address; at: number }[],
	original: Address | null,
	at: number,
): Address | null {
	return switches.find((entry) => entry.at <= at)?.quote ?? original
}

/**
 * A bid buys the base, so its taker sells base for quote; an ask's taker
 * buys base. Fills are base-denominated and priced at the order's tick.
 */
export function fillHop(
	amount: bigint,
	order: { token: Address; isBid: boolean; tick: number },
	quote: { address: Address; decimals: number },
	baseDecimals: number,
): DexHop {
	const priced = (amount * BigInt(100_000 + order.tick)) / 100_000n
	const value =
		quote.decimals >= baseDecimals
			? priced * 10n ** BigInt(quote.decimals - baseDecimals)
			: priced / 10n ** BigInt(baseDecimals - quote.decimals)
	return order.isBid
		? {
				from: order.token,
				to: quote.address,
				amountIn: amount,
				amountOut: value,
			}
		: {
				from: quote.address,
				to: order.token,
				amountIn: value,
				amountOut: amount,
			}
}

export type DexSwapRow = {
	id: string
	transactionHash: Hex
	taker: Address
	timestamp: number
	from: Address
	to: Address
	amountIn: bigint
	amountOut: bigint
}

/**
 * Chains one taker's fills in a transaction into a swap: the token only
 * sold is the source and the token only bought the destination, so routed
 * hops through an intermediate token collapse into one row. They only
 * collapse when each intermediate token's amount in matches its amount out,
 * so separate trades in one transaction stay apart. Anything else, such as
 * a round trip, is shown hop by hop.
 */
export function groupSwaps(
	hops: readonly (DexHop & {
		transactionHash: Hex
		taker: Address
		timestamp: number
		log: number
	})[],
): DexSwapRow[] {
	const groups = new Map<string, (typeof hops)[number][]>()
	for (const hop of hops) {
		const key = `${hop.transactionHash}:${hop.taker}`
		append(groups, key, hop)
	}
	return [...groups.values()].flatMap((group) => {
		const first = group.reduce((a, b) => (b.log < a.log ? b : a))
		const sold = new Set(group.map((hop) => hop.from))
		const bought = new Set(group.map((hop) => hop.to))
		const sources = [...sold].filter((token) => !bought.has(token))
		const targets = [...bought].filter((token) => !sold.has(token))
		const row = (
			from: Address,
			to: Address,
			log: number,
			hops: typeof group,
		): DexSwapRow => ({
			id: `${first.transactionHash}-${log}`,
			transactionHash: first.transactionHash,
			taker: first.taker,
			timestamp: first.timestamp,
			from,
			to,
			amountIn: hops
				.filter((hop) => hop.from === from)
				.reduce((sum, hop) => sum + hop.amountIn, 0n),
			amountOut: hops
				.filter((hop) => hop.to === to)
				.reduce((sum, hop) => sum + hop.amountOut, 0n),
		})
		const [source] = sources
		const [target] = targets
		const routed = [...sold]
			.filter((token) => bought.has(token))
			.every((token) =>
				balanced(
					group
						.filter((hop) => hop.to === token)
						.reduce((sum, hop) => sum + hop.amountOut, 0n),
					group
						.filter((hop) => hop.from === token)
						.reduce((sum, hop) => sum + hop.amountIn, 0n),
				),
			)
		if (
			routed &&
			sources.length === 1 &&
			targets.length === 1 &&
			source &&
			target
		)
			return [row(source, target, first.log, group)]
		const edges = new Map<string, typeof group>()
		for (const hop of group) {
			const key = `${hop.from}:${hop.to}`
			append(edges, key, hop)
		}
		return [...edges.values()].map((edge) => {
			const [hop] = edge as [(typeof group)[number]]
			return row(
				hop.from,
				hop.to,
				Math.min(...edge.map((entry) => entry.log)),
				edge,
			)
		})
	})
}

/**
 * Fills are priced per tick and rounded, so a routed amount can differ by a
 * little between the hop that buys it and the hop that sells it.
 */
function balanced(received: bigint, spent: bigint): boolean {
	const larger = received > spent ? received : spent
	const difference = received > spent ? received - spent : spent - received
	return difference <= 10n + larger / 10_000n
}
