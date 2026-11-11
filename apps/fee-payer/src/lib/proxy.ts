import { tempo, tempoDevnet, tempoModerato } from 'viem/chains'

/** Largest JSON-RPC body forwarded to Tempo API. */
export const maxBodyBytes = 256 * 1024

export const sponsorUrl = 'https://api.tempo.xyz/rpc/sponsor'

/**
 * Proxy configuration, read from the Worker's vars and secrets.
 *
 * - `TEMPO_ENV`: the network this deployment serves. Mainnet sponsors only
 *   listed legacy keys; every other network sponsors anyone.
 * - `TEMPO_API_KEY`: the Tempo API key that sponsors every forwarded request.
 * - `TEMPO_LEGACY_KEYS`: comma-separated legacy `tp_` keys still accepted.
 */
export type Config = {
	apiKey: string | undefined
	chainId: number
	legacyKeys: ReadonlySet<string>
	publicSponsorship: boolean
}

export type Env = {
	TEMPO_API_KEY?: string | undefined
	TEMPO_ENV?: string | undefined
	TEMPO_LEGACY_KEYS?: string | undefined
}

export function chainIdFor(tempoEnv: string | undefined): number {
	if (tempoEnv === 'mainnet') return tempo.id
	if (tempoEnv === 'devnet') return tempoDevnet.id
	return tempoModerato.id
}

export function parseLegacyKeys(raw: string | undefined): Set<string> {
	return new Set(
		(raw ?? '')
			.split(',')
			.map((key) => key.trim())
			.filter((key) => key.startsWith('tp_') && key.length > 3),
	)
}

export function readConfig(env: Env): Config {
	const chainId = chainIdFor(env.TEMPO_ENV)
	return {
		apiKey: env.TEMPO_API_KEY || undefined,
		chainId,
		legacyKeys: parseLegacyKeys(env.TEMPO_LEGACY_KEYS),
		publicSponsorship: chainId !== tempo.id,
	}
}

export type Resolution =
	| { ok: true; apiKey: string }
	| { ok: false; error: string; status: 401 | 503 }

/** Decide whether a request to `/` or `/tp_...` is sponsored. */
export function resolveApiKey(
	config: Config,
	legacyKey: string | undefined,
): Resolution {
	const allowed =
		config.publicSponsorship ||
		(legacyKey !== undefined && config.legacyKeys.has(legacyKey))
	if (!allowed)
		return legacyKey
			? { ok: false, error: 'Invalid or revoked API key', status: 401 }
			: { ok: false, error: 'API key required', status: 401 }
	if (!config.apiKey) {
		console.error('TEMPO_API_KEY is not configured')
		return { ok: false, error: 'Service misconfigured', status: 503 }
	}
	return { ok: true, apiKey: config.apiKey }
}

/**
 * Forward a JSON-RPC request to Tempo API's sponsor endpoint, pinned to this
 * deployment's chain, authenticated with `apiKey`. Only the body crosses:
 * client headers, cookies and query strings are dropped.
 */
export async function forward(
	request: Request,
	options: { apiKey: string; chainId: number },
): Promise<Response> {
	const length = Number(request.headers.get('content-length') ?? 0)
	if (length > maxBodyBytes) return json({ error: 'Request too large' }, 413)
	const body = await request.arrayBuffer()
	if (body.byteLength > maxBodyBytes)
		return json({ error: 'Request too large' }, 413)

	const url = `${sponsorUrl}/${options.chainId}`
	const upstream = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'tempo-api-key': options.apiKey,
		},
		body,
	})
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			'content-type':
				upstream.headers.get('content-type') ?? 'application/json',
		},
	})
}

function json(value: unknown, status: number): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json' },
	})
}
