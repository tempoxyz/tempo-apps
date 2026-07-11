import type { TempoEnv } from '#lib/env'

export const EXPLORER_ORGANIZATION_ID = 'https://tempo.xyz/#organization'

const CANONICAL_EXPLORER_ORIGINS: Partial<Record<TempoEnv, string>> = {
	mainnet: 'https://explore.tempo.xyz',
	testnet: 'https://explore.testnet.tempo.xyz',
}

const EXPLORER_HOST_REDIRECTS = new Map([
	['explore.4217.tempo.xyz', 'explore.tempo.xyz'],
	['explore.42431.tempo.xyz', 'explore.testnet.tempo.xyz'],
	['explore.mainnet.tempo.xyz', 'explore.tempo.xyz'],
	['explore.moderato.tempo.xyz', 'explore.testnet.tempo.xyz'],
	['explore.presto.tempo.xyz', 'explore.tempo.xyz'],
])

const NON_INDEXABLE_EXPLORER_HOSTS = new Set([
	'explore.31318.tempo.xyz',
	'explore.devnet.tempo.xyz',
	'explore.nextfork.devnet.tempo.xyz',
])

export type ExplorerHostPolicy = { type: 'redirect'; location: string }

export function getExplorerHostPolicy(
	requestUrl: string | URL,
): ExplorerHostPolicy | undefined {
	const url = new URL(requestUrl)
	const hostname = url.hostname.toLowerCase()

	const canonicalHostname = EXPLORER_HOST_REDIRECTS.get(hostname)
	if (!canonicalHostname) return undefined

	url.protocol = 'https:'
	url.hostname = canonicalHostname
	url.port = ''

	return { type: 'redirect', location: url.toString() }
}

export function isNonIndexableExplorerHost(hostname: string): boolean {
	const host = hostname.toLowerCase()
	return (
		NON_INDEXABLE_EXPLORER_HOSTS.has(host) ||
		host.includes('explorer-devnet') ||
		host.includes('explorer-nextfork')
	)
}

export function withExplorerIndexingHeaders(
	requestUrl: string | URL,
	response: Response,
): Response {
	const url = new URL(requestUrl)
	if (!isNonIndexableExplorerHost(url.hostname)) return response

	const headers = new Headers(response.headers)
	headers.set('X-Robots-Tag', 'noindex, nofollow')

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	})
}

export function getCanonicalExplorerUrl(
	tempoEnv: TempoEnv,
	pathname: string,
): string | undefined {
	const origin = CANONICAL_EXPLORER_ORIGINS[tempoEnv]
	if (!origin) return undefined

	const url = new URL(origin)
	url.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`
	return url.toString()
}

export function getExplorerWebApplication(tempoEnv: TempoEnv) {
	const origin = CANONICAL_EXPLORER_ORIGINS[tempoEnv]
	if (!origin) return undefined

	const name =
		tempoEnv === 'testnet' ? 'Tempo Testnet Explorer' : 'Tempo Explorer'

	return {
		'@context': 'https://schema.org',
		'@id': `${origin}/#application`,
		'@type': 'WebApplication',
		applicationCategory: 'DeveloperApplication',
		description:
			'Explore and analyze blocks, transactions, contracts, and tokens on Tempo.',
		isPartOf: { '@id': 'https://tempo.xyz/#website' },
		name,
		operatingSystem: 'Web',
		provider: { '@id': EXPLORER_ORGANIZATION_ID },
		url: `${origin}/`,
	}
}
