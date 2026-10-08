import * as z from 'zod/mini'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'

const clientEnvSchema = z.object({
	CONTRACT_VERIFICATION_API_BASE_URL: z.prefault(
		z.url(),
		'https://contracts.tempo.xyz',
	),
})

export const clientEnv = clientEnvSchema.parse({
	CONTRACT_VERIFICATION_API_BASE_URL: import.meta.env
		.VITE_CONTRACT_VERIFICATION_API_BASE_URL,
})

export type TempoEnv =
	| 'testnet'
	| 'mainnet'
	| 'devnet'
	| 'nextfork'
	| 'zone-prover'
	| 'preview'

export function inferTempoEnvFromHostname(
	hostname: string | undefined,
): TempoEnv | undefined {
	if (!hostname) return undefined

	const host = hostname.toLowerCase()

	if (
		host.includes('explorer-zone-prover') ||
		host === 'explore.zone-prover.devnet.tempo.xyz'
	)
		return 'zone-prover'

	if (
		host.includes('explorer-mainnet') ||
		host.includes('explore.mainnet.') ||
		host.includes('explore.presto.') ||
		host.includes('explore.4217.') ||
		host === 'explore.tempo.xyz'
	) {
		return 'mainnet'
	}

	if (
		host.includes('explorer-nextfork') ||
		host.includes('explore.nextfork.') ||
		host.includes('explore-nextfork.') ||
		host.includes('nextfork.devnet.')
	) {
		return 'nextfork'
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
	return value === 'mainnet' ||
		value === 'devnet' ||
		value === 'nextfork' ||
		value === 'preview' ||
		value === 'zone-prover'
		? value
		: 'testnet'
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

/** Preview runtime configuration is authoritative even when a name contains a network label. */
export function resolveTempoEnv(
	hostname: string | undefined,
	configured: string | undefined,
): TempoEnv {
	if (configured === 'preview') return 'preview'
	return inferTempoEnvFromHostname(hostname) ?? normalizeTempoEnv(configured)
}

export const getTempoEnv = createIsomorphicFn()
	.client(() =>
		resolveTempoEnv(window.location.hostname, import.meta.env.VITE_TEMPO_ENV),
	)
	.server(() =>
		resolveTempoEnv(
			getRequestUrlIfAvailable()?.hostname,
			import.meta.env.VITE_TEMPO_ENV,
		),
	)

export const isTestnet = createIsomorphicFn()
	.client(() => getTempoEnv() === 'testnet')
	.server(() => getTempoEnv() === 'testnet')
