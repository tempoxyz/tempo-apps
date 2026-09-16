import {
	ZONE_PROVER_CHAIN_ID,
	ZONE_PROVER_RPC_URL,
	ZONE_PROVER_TIDX_URL,
} from '#lib/zone-prover'
import { serverEnv } from './env'

/** Authenticated backends are selected by chain ID, never by page hostname. */
export function getChainBackend(chainId: number, kind: 'rpc' | 'tidx') {
	if (chainId !== ZONE_PROVER_CHAIN_ID) return undefined
	const authorization =
		kind === 'rpc'
			? serverEnv.ZONE_PROVER_RPC_AUTH
			: serverEnv.ZONE_PROVER_TIDX_AUTH
	if (!authorization || !/^Basic [A-Za-z0-9+/]+=*$/.test(authorization))
		throw new Error(`Chain ${chainId} ${kind} credentials are not configured`)
	return {
		url: kind === 'rpc' ? ZONE_PROVER_RPC_URL : ZONE_PROVER_TIDX_URL,
		headers: { Authorization: authorization },
	}
}
