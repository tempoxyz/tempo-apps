import type { TempoEnv } from './env'

export const EXPLORER_NETWORK_OPTIONS = [
	{
		env: 'mainnet',
		label: 'Mainnet',
		host: 'https://explore.tempo.xyz',
		dotClassName: 'bg-positive',
	},
	{
		env: 'testnet',
		label: 'Testnet',
		host: 'https://explore.testnet.tempo.xyz',
		dotClassName: 'bg-amber-400',
	},
] as const

export function getActiveExplorerNetworkOption(tempoEnv: TempoEnv) {
	if (tempoEnv === 'mainnet') return EXPLORER_NETWORK_OPTIONS[0]
	if (tempoEnv === 'testnet') return EXPLORER_NETWORK_OPTIONS[1]

	return {
		env: tempoEnv,
		label: tempoEnv === 'nextfork' ? 'Nextfork' : 'Devnet',
		dotClassName: 'bg-amber-400',
	}
}

export function buildExplorerNetworkHref(
	host: string,
	path: string,
	options?: buildExplorerNetworkHref.Options,
): string {
	const targetPath = options?.fallbackToHome ? '/' : path
	return `${host}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`
}

export namespace buildExplorerNetworkHref {
	export interface Options {
		fallbackToHome?: boolean
	}
}
