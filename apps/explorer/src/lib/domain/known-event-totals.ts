import type { KnownEvent } from '#lib/domain/known-events'

export const NORMALIZED_KNOWN_EVENT_TOTAL_DECIMALS = 18
export const DEFAULT_KNOWN_EVENT_AMOUNT_DECIMALS = 18

type Amount = NonNullable<KnownEvent['totalAmount']>
type AmountPart = KnownEvent['parts'][number] & { type: 'amount' }

type Flow = {
	inflow: bigint
	outflow: bigint
}

function toBigInt(value: bigint | string | number): bigint {
	return typeof value === 'bigint' ? value : BigInt(value)
}

function normalizeAmount(amountValue: Amount): bigint {
	const decimals = amountValue.decimals ?? DEFAULT_KNOWN_EVENT_AMOUNT_DECIMALS
	const value = toBigInt(amountValue.value as bigint | string | number)
	const decimalDelta = NORMALIZED_KNOWN_EVENT_TOTAL_DECIMALS - decimals

	if (decimalDelta === 0) return value
	if (decimalDelta > 0) return value * 10n ** BigInt(decimalDelta)
	return value / 10n ** BigInt(-decimalDelta)
}

export function calculateKnownEventsTotal(
	events: readonly KnownEvent[],
): bigint {
	let fallbackTotal = 0n
	const flowsByToken = new Map<string, Map<string, Flow>>()
	const countPricedOnly = events.some((event) => {
		if (event.type === 'approval') return false
		const amounts = event.totalAmount
			? [event.totalAmount]
			: event.parts
					.filter((part): part is AmountPart => part.type === 'amount')
					.map((part) => part.value)
		return amounts.some((amount) => Boolean(amount.currency))
	})

	for (const event of events) {
		// Approvals grant spending permission rather than moving value, and
		// frequently use type(uint256).max ("infinite approval"), which would
		// otherwise dominate the total.
		if (event.type === 'approval') continue

		const amounts = event.totalAmount
			? [event.totalAmount]
			: event.parts
					.filter((part): part is AmountPart => part.type === 'amount')
					.map((part) => part.value)
		if (amounts.length === 0) continue

		const totalableAmounts = countPricedOnly
			? amounts.filter((amount) => Boolean(amount.currency))
			: amounts
		if (totalableAmounts.length === 0) continue

		const from = event.meta?.from?.toLowerCase()
		const to = event.meta?.to?.toLowerCase()

		if (!from || !to) {
			fallbackTotal += totalableAmounts.reduce((max, amountValue) => {
				const amount = normalizeAmount(amountValue)
				return amount > max ? amount : max
			}, 0n)
			continue
		}

		for (const amountValue of totalableAmounts) {
			const token = amountValue.token.toLowerCase()
			const amount = normalizeAmount(amountValue)
			let flows = flowsByToken.get(token)
			if (!flows) {
				flows = new Map()
				flowsByToken.set(token, flows)
			}

			const fromFlow = flows.get(from) ?? { inflow: 0n, outflow: 0n }
			fromFlow.outflow += amount
			flows.set(from, fromFlow)

			const toFlow = flows.get(to) ?? { inflow: 0n, outflow: 0n }
			toFlow.inflow += amount
			flows.set(to, toFlow)
		}
	}

	let netOutflowTotal = 0n
	for (const flows of flowsByToken.values()) {
		let maxNetOutflow = 0n
		for (const flow of flows.values()) {
			const netOutflow = flow.outflow - flow.inflow
			if (netOutflow > maxNetOutflow) maxNetOutflow = netOutflow
		}
		netOutflowTotal += maxNetOutflow
	}

	return netOutflowTotal + fallbackTotal
}
