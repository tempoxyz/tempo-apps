export const TOKENLIST_BASE_URL = 'https://tokenlist.tempo.xyz'

export const TOKENLIST_URLS: Record<number, string> = {
	4217: `${TOKENLIST_BASE_URL}/list/4217`,
	42431: `${TOKENLIST_BASE_URL}/list/42431`,
	31318: `${TOKENLIST_BASE_URL}/list/31318`,
}

const FEE_TOKEN_BY_CHAIN_ID: Record<number, `0x${string}`> = {
	4217: '0x20c0000000000000000000000000000000000000',
	42431: '0x20c0000000000000000000000000000000000001',
	31318: '0x20c0000000000000000000000000000000000002',
}

export function getFeeTokenForChain(
	chainId: number,
): `0x${string}` | undefined {
	return FEE_TOKEN_BY_CHAIN_ID[chainId]
}
