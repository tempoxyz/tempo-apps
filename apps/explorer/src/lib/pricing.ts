import type { Address } from 'ox'

type TokenAmountCandidate = {
	currency?: string | undefined
	token?: Address.Address | undefined
}

type TokenAmount = TokenAmountCandidate & {
	token: Address.Address
}

type IsTokenListed = (
	chainId: number,
	address: Address.Address | undefined,
) => boolean

export function hasTokenAmount<T extends TokenAmountCandidate>(
	amount: T | null | undefined,
): amount is T & TokenAmount {
	return amount?.token !== undefined
}

export function isUsdPricedToken(
	chainId: number,
	amount: TokenAmount,
	isTokenListed: IsTokenListed,
): boolean {
	return amount.currency === 'USD' && isTokenListed(chainId, amount.token)
}

export function areUsdPricedTokens(
	chainId: number,
	amounts: ReadonlyArray<TokenAmount>,
	isTokenListed: IsTokenListed,
): boolean {
	if (amounts.length === 0) return false
	return amounts.every((amount) =>
		isUsdPricedToken(chainId, amount, isTokenListed),
	)
}
