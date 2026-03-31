import * as z from 'zod/mini'
import type { Chain } from 'viem'
import { defineChain } from 'viem'
import { createMiddleware } from 'hono/factory'

import { getLogger } from '#lib/logger.ts'

const logger = getLogger(['tempo', 'chain-registry'])

// ---------------------------------------------------------------------------
// Zod schema -- chainlist.org-compatible, most fields optional
// ---------------------------------------------------------------------------

const zExplorer = z.object({
	name: z.string(),
	url: z.string(),
	standard: z.optional(z.string()),
})

const zNativeCurrency = z.object({
	name: z.string(),
	symbol: z.string(),
	decimals: z.number(),
})

const zChainEntry = z.object({
	chainId: z.number(),
	rpc: z.array(z.string()).check(z.minLength(1)),
	hidden: z.optional(z.boolean()),
	name: z.optional(z.string()),
	chain: z.optional(z.string()),
	shortName: z.optional(z.string()),
	infoURL: z.optional(z.string()),
	nativeCurrency: z.optional(zNativeCurrency),
	explorers: z.optional(z.array(zExplorer)),
})

const zChainsResponse = z.record(z.string(), zChainEntry)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChainEntry = {
	chain: Chain
	hidden: boolean
}

export type SourcifyChain = {
	name: string
	title?: string | undefined
	chainId: number
	rpc: string[]
	traceSupportedRPCs: Array<{ type?: string; index?: number }>
	supported: boolean
	etherscanAPI: boolean
}

// ---------------------------------------------------------------------------
// ChainRegistry
// ---------------------------------------------------------------------------

export class ChainRegistry {
	private readonly entries: Map<number, ChainEntry>

	constructor(entries: Map<number, ChainEntry>) {
		this.entries = entries
	}

	/** Build a registry from static chains only (no external fetch). */
	static fromStatic(staticChains: readonly Chain[]): ChainRegistry {
		const entries = new Map<number, ChainEntry>()
		for (const chain of staticChains) {
			entries.set(chain.id, { chain, hidden: false })
		}
		return new ChainRegistry(entries)
	}

	/** Fetch chain configs from an external URL and merge with static chains. */
	static async fromUrl(options: {
		url: string
		authToken?: string | undefined
		staticChains: readonly Chain[]
	}): Promise<ChainRegistry> {
		const registry = ChainRegistry.fromStatic(options.staticChains)

		try {
			const headers = new Headers({ Accept: 'application/json' })
			if (options.authToken) {
				headers.set('Authorization', `Bearer ${options.authToken}`)
			}

			const response = await fetch(options.url, { headers })

			if (!response.ok) {
				logger.warn('chain_registry_fetch_failed', {
					status: response.status,
					url: options.url,
				})
				return registry
			}

			const json = await response.json()
			const parsed = zChainsResponse.safeParse(json)

			if (!parsed.success) {
				logger.warn('chain_registry_parse_failed', {
					error: parsed.error,
					url: options.url,
				})
				return registry
			}

			for (const [key, entry] of Object.entries(parsed.data)) {
				const chainId = entry.chainId

				// static chains always take precedence
				if (registry.entries.has(chainId)) {
					logger.debug('chain_registry_skip_static', {
						chainId,
						key,
					})
					continue
				}

				const httpUrls = entry.rpc.filter(
					(url) => url.startsWith('http://') || url.startsWith('https://'),
				)
				if (httpUrls.length === 0) {
					logger.warn('chain_registry_no_http_rpc', { chainId, key })
					continue
				}

				const defaultExplorer = entry.explorers?.[0]

				const chain = defineChain({
					id: chainId,
					name: entry.name ?? `Chain ${chainId}`,
					nativeCurrency: entry.nativeCurrency ?? {
						name: 'Ether',
						symbol: 'ETH',
						decimals: 18,
					},
					rpcUrls: {
						default: {
							http: httpUrls as [string, ...string[]],
						},
					},
					...(defaultExplorer
						? {
								blockExplorers: {
									default: {
										name: defaultExplorer.name,
										url: defaultExplorer.url,
									},
								},
							}
						: {}),
				})

				registry.entries.set(chainId, {
					chain,
					hidden: entry.hidden ?? false,
				})
			}

			logger.info('chain_registry_loaded', {
				total: registry.entries.size,
				dynamic: registry.entries.size - options.staticChains.length,
				url: options.url,
			})
		} catch (error) {
			logger.warn('chain_registry_error', {
				error: error instanceof Error ? error.message : String(error),
				url: options.url,
			})
		}

		return registry
	}

	/** Returns the viem Chain for a given ID, regardless of hidden flag. */
	getChain(chainId: number): Chain | undefined {
		return this.entries.get(chainId)?.chain
	}

	/** Whether a chain ID exists in the registry, regardless of hidden flag. */
	isSupported(chainId: number): boolean {
		return this.entries.has(chainId)
	}

	/** Whether a chain ID is marked as hidden. Returns false for unknown chains. */
	isHidden(chainId: number): boolean {
		return this.entries.get(chainId)?.hidden ?? false
	}

	/** Returns all non-hidden chains in Sourcify-compatible format. */
	getSourcifyChains(): SourcifyChain[] {
		const result: SourcifyChain[] = []
		for (const { chain, hidden } of this.entries.values()) {
			if (hidden) continue
			result.push({
				name: chain.name,
				title: chain.name,
				chainId: chain.id,
				rpc: [...chain.rpcUrls.default.http],
				traceSupportedRPCs: [],
				supported: true,
				etherscanAPI: false,
			})
		}
		return result
	}
}

// ---------------------------------------------------------------------------
// Hono middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates a Hono middleware that initializes a `ChainRegistry` and sets it on
 * the context.
 *
 * ```ts
 * app.use(chainRegistry({
 *   staticChains,
 *   url: context.env.CHAINS_CONFIG_URL,
 *   authToken: context.env.CHAINS_CONFIG_AUTH_TOKEN,
 * }))
 * ```
 */
export function chainRegistry(options: {
	staticChains: readonly Chain[]
	url?: string | undefined
	authToken?: string | undefined
}) {
	return createMiddleware<{
		Variables: { chainRegistry: ChainRegistry }
	}>(async (context, next) => {
		const registry = options.url
			? await ChainRegistry.fromUrl({
					url: options.url,
					authToken: options.authToken,
					staticChains: options.staticChains,
				})
			: ChainRegistry.fromStatic(options.staticChains)
		context.set('chainRegistry', registry)
		await next()
	})
}
