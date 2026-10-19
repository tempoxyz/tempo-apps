import {
	ZONE_PROVER_CHAIN_ID,
	ZONE_PROVER_RPC_URL,
	ZONE_PROVER_TIDX_URL,
} from '#lib/zone-prover'
import { devnetUrls, serverEnv } from './env'

const DEVNET_CHAIN_ID = 31318

const RPC_BACKENDS = {
	mainnet: { chainId: 4217, url: 'https://rpc.tempo.xyz' },
	testnet: { chainId: 42431, url: 'https://rpc.testnet.tempo.xyz' },
	devnet: { chainId: 31318, url: 'https://rpc.devnet.tempoxyz.dev' },
	nextfork: { chainId: 31318, url: 'https://rpc-nextfork.devnet.tempoxyz.dev' },
}

/** Public RPCs that also serve unauthenticated requests, at public limits. */
const PUBLIC_RPC_BACKENDS = new Set(['mainnet', 'testnet'])

/** Select the upstream from deployment configuration, never caller input. */
export function getExplorerRpcBackend(
	environment: string | undefined,
	auth: string | undefined,
) {
	if (environment === 'zone-prover') {
		const target = getChainBackend(ZONE_PROVER_CHAIN_ID, 'rpc')
		if (!target) throw new Error('RPC network is not configured')
		return { ...target, chainId: ZONE_PROVER_CHAIN_ID }
	}
	const devnetTarget = getDevnetBackend(environment, 'rpc')
	if (devnetTarget) return { ...devnetTarget, chainId: DEVNET_CHAIN_ID }
	if (!environment || !Object.hasOwn(RPC_BACKENDS, environment))
		throw new Error('RPC network is not configured')
	// Without an Orchestra credential, public networks fall back to the
	// unauthenticated endpoint rather than failing every read.
	if (!auth && PUBLIC_RPC_BACKENDS.has(environment))
		return {
			...RPC_BACKENDS[environment as keyof typeof RPC_BACKENDS],
			headers: {} as Record<string, string>,
		}
	if (!auth || !/^[^:\s]+:[^\s]+$/.test(auth))
		throw new Error('RPC credentials are not configured')
	return {
		...RPC_BACKENDS[environment as keyof typeof RPC_BACKENDS],
		headers: { Authorization: `Basic ${btoa(auth)}` },
	}
}

/** Authenticated backends are selected by chain ID, never by page hostname. */
export function getChainBackend(chainId: number, kind: 'rpc' | 'tidx') {
	if (chainId === DEVNET_CHAIN_ID)
		return getDevnetBackend(import.meta.env.VITE_TEMPO_ENV, kind)
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

/**
 * A `devnet` build's compiled-in `DEVNET_RPC_URL` or `DEVNET_TIDX_URL` backend
 * (see `devnetUrls`), with its complete `Basic ...` or `Bearer ...` header
 * from `DEVNET_RPC_AUTH` or `DEVNET_TIDX_AUTH`.
 * Undefined when the build isn't `devnet` or the URL is unset, which keeps the
 * default devnet backends. A set URL without valid credentials fails closed.
 */
export function getDevnetBackend(
	environment: string | undefined,
	kind: 'rpc' | 'tidx',
) {
	if (environment !== 'devnet') return undefined
	const url =
		kind === 'rpc' ? devnetUrls.DEVNET_RPC_URL : devnetUrls.DEVNET_TIDX_URL
	if (!url) return undefined
	const authorization =
		kind === 'rpc' ? serverEnv.DEVNET_RPC_AUTH : serverEnv.DEVNET_TIDX_AUTH
	if (
		!authorization ||
		!/^(Basic [A-Za-z0-9+/]+=*|Bearer [A-Za-z0-9._~+/-]+=*)$/.test(
			authorization,
		)
	)
		throw new Error(`Devnet ${kind} credentials are not configured`)
	return { url, headers: { Authorization: authorization } }
}
