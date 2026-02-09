import { formatUnits } from 'viem'

export function toUnixTimestamp(value: unknown): number {
	const s = String(value).replace(/([+-]\d{2}:\d{2}):\d{2}$/, '$1')
	const ms = new Date(s).getTime()
	if (!Number.isNaN(ms)) return Math.floor(ms / 1000)
	const n = Number(value)
	return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
}

export function computePriceNative(
	tickPrice: bigint,
	baseDecimals: number,
	quoteDecimals: number,
	scale: bigint,
): string {
	const PRICE_PRECISION = 36
	const priceBig =
		(tickPrice * 10n ** BigInt(baseDecimals + PRICE_PRECISION)) /
		(scale * 10n ** BigInt(quoteDecimals))
	return formatUnits(priceBig, PRICE_PRECISION)
}
