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
