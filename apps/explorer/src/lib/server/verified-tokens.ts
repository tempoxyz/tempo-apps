import { type InferResponseType, parseResponse } from 'hono/client'
import { api } from '#lib/server/tempo-api'

/**
 * Server-only. Must not be imported from client-reachable modules (including
 * server-fn files like `tokens.ts`, whose non-server-fn exports survive into
 * the client bundle together with their imports — pulling `tempo-api`/`env`
 * into the browser, where the env parse throws and kills hydration).
 */

/** A row of the API's curated verified-token list (the token registry). */
export type VerifiedToken = InferResponseType<
	typeof api.v1.tokens.$get,
	200
>['data'][number]

type CachedVerifiedTokens = { tokens: VerifiedToken[]; ts: number }

const verifiedTokensCache = new Map<number, CachedVerifiedTokens>()

/**
 * The chain's curated verified-token list from the API (5-min memo). Serves
 * search and the listed-token spam filters; falls back to the last good
 * snapshot when the API is unreachable.
 */
export async function getVerifiedTokens(
	chainId: number,
): Promise<VerifiedToken[]> {
	const now = Date.now()
	const cached = verifiedTokensCache.get(chainId)
	if (cached && now - cached.ts < 5 * 60_000) return cached.tokens

	try {
		const { data } = await parseResponse(
			api.v1.tokens.$get({
				query: { chainId: String(chainId), verified: 'true' },
			}),
		)
		verifiedTokensCache.set(chainId, { tokens: data, ts: now })
		return data
	} catch (error) {
		console.error('Failed to fetch verified tokens:', error)
		return cached?.tokens ?? []
	}
}

/** Lowercased contract addresses of the chain's verified tokens. */
export async function getVerifiedTokenAddresses(
	chainId: number,
): Promise<Set<string>> {
	const tokens = await getVerifiedTokens(chainId)
	return new Set(tokens.map((token) => token.address.toLowerCase()))
}
