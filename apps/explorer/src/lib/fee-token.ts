import { tempo, tempoModerato } from 'viem/chains'
import { alphausd, pathusd } from 'viem/tokens'

const FEE_TOKEN_BY_CHAIN_ID: Record<number, `0x${string}`> = {
	[tempo.id]: pathusd.addresses[tempo.id],
	[tempoModerato.id]: alphausd.addresses[tempoModerato.id],
	31318: '0x20c0000000000000000000000000000000000002',
	31319: '0x20c0000000000000000000000000000000000002',
}

export function getFeeTokenForChain(
	chainId: number,
): `0x${string}` | undefined {
	return FEE_TOKEN_BY_CHAIN_ID[chainId]
}
