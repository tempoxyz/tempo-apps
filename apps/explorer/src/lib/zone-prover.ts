// Chain ID is deliberately shared with other devnets. Never use it to choose
// an upstream for this network, and never fall back to the standard devnet.
export const ZONE_PROVER_CHAIN_ID = 31318
export const ZONE_PROVER_EXPLORER_URL =
	'https://dev-eu-zone-prover-explorer.tail388b2e.ts.net'
export const ZONE_PROVER_RPC_URL =
	'http://nodes-rpc-service.tempo-devnet-zone-prover.svc.cluster.local:8545'
export const ZONE_PROVER_TIDX_URL =
	'http://tidx.tempo-devnet-zone-prover.svc.cluster.local:8080'

export function zoneProverTarget(kind: 'rpc' | 'tidx') {
	return {
		url: kind === 'rpc' ? ZONE_PROVER_RPC_URL : ZONE_PROVER_TIDX_URL,
		headers: {},
	}
}
