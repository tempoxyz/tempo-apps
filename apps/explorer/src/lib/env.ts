import * as z from 'zod/mini'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'

const clientEnvSchema = z.object({
	CONTRACT_VERIFICATION_API_BASE_URL: z.prefault(
		z.url(),
		'https://contracts.tempo.xyz',
	),
})

export const clientEnv = clientEnvSchema.parse(import.meta.env)

export type TempoEnv = 'testnet' | 'mainnet' | 'devnet'

export function inferTempoEnvFromHostname(
	hostname: string | undefined,
): TempoEnv | undefined {
	if (!hostname) return undefined

	const host = hostname.toLowerCase()

	if (
		host.includes('explorer-mainnet') ||
		host.includes('explore.mainnet.') ||
		host.includes('explore.presto.') ||
		host.includes('explore.4217.')
	) {
		return 'mainnet'
	}

	if (
		host.includes('explorer-devnet') ||
		host.includes('explore.devnet.') ||
		host.includes('explore.31318.')
	) {
		return 'devnet'
	}

	if (
		host.includes('explorer-testnet') ||
		host.includes('explore.testnet.') ||
		host.includes('explore.moderato.') ||
		host.includes('explore.42431.')
	) {
		return 'testnet'
	}

	return undefined
}

function normalizeTempoEnv(value: string | undefined): TempoEnv {
	return value === 'mainnet' || value === 'devnet' ? value : 'testnet'
}

function getRequestUrlIfAvailable(): URL | undefined {
	try {
		return getRequestUrl()
	} catch {
		return undefined
	}
}

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
	.client(() => {
		const inferred = inferTempoEnvFromHostname(window.location.hostname)
		return inferred ?? normalizeTempoEnv(import.meta.env.VITE_TEMPO_ENV)
	})
	.server(() => {
		// Some modules read the active chain at import time before TanStack Start has
		// established request AsyncLocalStorage. Fall back to Vite env there. In
		// Cloudflare/Vite dev, `process.env` may not include the command env inside
		// the worker runtime.
		const inferred = inferTempoEnvFromHostname(
			getRequestUrlIfAvailable()?.hostname,
		)
		return inferred ?? normalizeTempoEnv(import.meta.env.VITE_TEMPO_ENV)
	})

export const isTestnet = createIsomorphicFn()
	.client(() => getTempoEnv() === 'testnet')
	.server(() => getTempoEnv() === 'testnet')

export const hasIndexSupply = createIsomorphicFn()
	.client(
		() =>
			getTempoEnv() === 'testnet' ||
			getTempoEnv() === 'mainnet' ||
			getTempoEnv() === 'devnet',
	)
	.server(
		() =>
			getTempoEnv() === 'testnet' ||
			getTempoEnv() === 'mainnet' ||
			getTempoEnv() === 'devnet',
	)
