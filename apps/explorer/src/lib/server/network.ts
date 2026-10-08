import {
	ZONE_PROVER_CHAIN_ID,
	ZONE_PROVER_RPC_URL,
	ZONE_PROVER_TIDX_URL,
} from '#lib/zone-prover'
import { serverEnv } from './env'
import {
	isMultisigExplorer,
	MULTISIG_CHAIN_ID,
	MULTISIG_RPC_URL,
} from '#lib/multisig'

const RPC_BACKENDS = {
	mainnet: { chainId: 4217, url: 'https://rpc.tempo.xyz' },
	testnet: { chainId: 42431, url: 'https://rpc.testnet.tempo.xyz' },
	devnet: { chainId: 31318, url: 'https://rpc.devnet.tempoxyz.dev' },
	nextfork: { chainId: 31318, url: 'https://rpc-nextfork.devnet.tempoxyz.dev' },
	multisig1: { chainId: MULTISIG_CHAIN_ID, url: MULTISIG_RPC_URL },
}

/** Select the upstream from deployment configuration, never caller input. */
export function getExplorerRpcBackend(
	environment: string | undefined,
	auth: string | undefined,
): { chainId: number; url: string; headers: { Authorization: string } } {
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
	if (isMultisigExplorer()) {
		if (chainId !== MULTISIG_CHAIN_ID)
			throw new Error('Multisig explorer chain does not match')
		if (kind === 'tidx')
			throw new Error('Indexed history is not available for multisig1')
		return getExplorerRpcBackend('multisig1', process.env.RPC_AUTH)
	}
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
