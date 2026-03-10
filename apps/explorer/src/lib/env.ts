import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'

export type TempoEnv = 'testnet' | 'mainnet' | 'devnet'

export const getRequestURL = createIsomorphicFn()
	.client(() => new URL(__BASE_URL__ || window.location.origin))
	.server(() => getRequestUrl())

export const getApiBaseURL = createIsomorphicFn()
	.client(() => {
		const base = __BASE_URL__ || window.location.origin
		const url = new URL(base, window.location.origin)
		url.username = ''
		url.password = ''
		return url
	})
	.server(() => {
		if (__BASE_URL__) return new URL(__BASE_URL__)
		return getRequestUrl()
	})

export function getApiUrl(path: string, searchParams?: URLSearchParams): URL {
	const url = new URL(path, getApiBaseURL())
	if (searchParams) url.search = searchParams.toString()
	return url
}

export const getTempoEnv = createIsomorphicFn()
	.client(() => import.meta.env.VITE_TEMPO_ENV as TempoEnv)
	.server(() => process.env.VITE_TEMPO_ENV as TempoEnv)

export const isTestnet = createIsomorphicFn()
	.client(() => import.meta.env.VITE_TEMPO_ENV === 'testnet')
	.server(() => process.env.VITE_TEMPO_ENV === 'testnet')

export const hasIndexSupply = createIsomorphicFn()
	.client(
		() =>
			import.meta.env.VITE_TEMPO_ENV === 'testnet' ||
			import.meta.env.VITE_TEMPO_ENV === 'mainnet' ||
			import.meta.env.VITE_TEMPO_ENV === 'devnet',
	)
	.server(
		() =>
			process.env.VITE_TEMPO_ENV === 'testnet' ||
			process.env.VITE_TEMPO_ENV === 'mainnet' ||
			process.env.VITE_TEMPO_ENV === 'devnet',
	)
