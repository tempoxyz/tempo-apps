import {
	ZONE_PROVER_CHAIN_ID,
	ZONE_PROVER_RPC_URL,
	ZONE_PROVER_TIDX_URL,
} from '#lib/zone-prover'
import { serverEnv } from './env'

const RPC_BACKENDS = {
	mainnet: { chainId: 4217, url: 'https://rpc.tempo.xyz' },
	testnet: { chainId: 42431, url: 'https://rpc.testnet.tempo.xyz' },
	devnet: { chainId: 31318, url: 'https://rpc.devnet.tempoxyz.dev' },
	nextfork: { chainId: 31318, url: 'https://rpc-nextfork.devnet.tempoxyz.dev' },
}

/** Select the upstream from deployment configuration, never caller input. */
export function getExplorerRpcBackend(
	environment: string | undefined,
	auth: string | undefined,
) {
	if (environment === 'preview') {
		if (!serverEnv.PREVIEW_CHAIN_ID || !serverEnv.PREVIEW_RPC_URL)
			throw new Error('Preview RPC is not configured')
		return {
			chainId: serverEnv.PREVIEW_CHAIN_ID,
			url: serverEnv.PREVIEW_RPC_URL,
			headers: {} as Record<string, string>,
		}
	}
	if (environment === 'zone-prover') {
		const target = getChainBackend(ZONE_PROVER_CHAIN_ID, 'rpc')
		if (!target) throw new Error('RPC network is not configured')
		return { ...target, chainId: ZONE_PROVER_CHAIN_ID }
	}
	if (!environment || !Object.hasOwn(RPC_BACKENDS, environment))
		throw new Error('RPC network is not configured')
	if (!auth || !/^[^:\s]+:[^\s]+$/.test(auth))
		throw new Error('RPC credentials are not configured')
	return {
		...RPC_BACKENDS[environment as keyof typeof RPC_BACKENDS],
		headers: { Authorization: `Basic ${btoa(auth)}` },
	}
}

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
