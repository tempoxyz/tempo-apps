// Chain ID is deliberately shared with other devnets. Never use it to choose
// an upstream for this network, and never fall back to the standard devnet.
export const ZONE_PROVER_CHAIN_ID = 31318
export const ZONE_PROVER_EXPLORER_URL = 'https://explore-zone-prover.tehq.net'
export const ZONE_PROVER_RPC_URL = 'https://rpc-zone-prover.devnet.tempoxyz.dev'
export const ZONE_PROVER_TIDX_URL =
	'https://tidx-zone-prover.devnet.tempoxyz.dev'

export function zoneProverTarget(kind: 'rpc' | 'tidx', authorization?: string) {
	if (!authorization || !/^Basic [A-Za-z0-9+/]+=*$/.test(authorization))
		throw new Error(`Zone prover ${kind} credentials are not configured`)
	return {
		url: kind === 'rpc' ? ZONE_PROVER_RPC_URL : ZONE_PROVER_TIDX_URL,
		headers: { Authorization: authorization },
	}
}
