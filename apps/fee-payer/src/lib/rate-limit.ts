import { env } from 'cloudflare:workers'
import type { Context, Next } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { Hex, RpcRequest } from 'ox'
import { formatUnits } from 'viem'
import { Transaction } from 'viem/tempo'
import * as z from 'zod/mini'
import type { ApiKeyRecord } from './api-keys.js'
import { checkBudget, recordSpend } from './api-key-budget.js'

const FillTransaction = z.object({
	feePayer: z.optional(z.union([z.boolean(), z.string()])),
	to: z.optional(z.string()),
	calls: z.optional(
		z.array(
			z.object({
				to: z.optional(z.string()),
			}),
		),
	),
})

/**
 * Middleware that rate limits sponsorship requests by client IP.
 * Extracts serialized transactions and object-form fill requests before checking
 * the rate limiter and any API-key restrictions.
 *
 * When `opts.keyed` is true, uses the `KeyedAddressRateLimiter` binding (looser
 * limits, since per-key $ budget is the real ceiling). Otherwise uses the open
 * `AddressRateLimiter` binding. Falls back to the open limiter when the keyed
 * binding is not configured (non-mainnet envs).
 *
 * When an API key is present (set by apiKeyMiddleware), also enforces:
 *  - Per-key daily spend budget
 *  - Allowed destination addresses
 *
 * Only applies to requests carrying a serialized 0x76 Tempo transaction.
 * Non-transaction RPC calls (e.g. eth_chainId) pass through to the handler.
 */
export function rateLimitMiddleware(opts: { keyed: boolean }) {
	return async (c: Context, next: Next) => {
		const limiter = opts.keyed
			? (env.KeyedAddressRateLimiter ?? env.AddressRateLimiter)
			: env.AddressRateLimiter
		if (!limiter) {
			console.error(
				`${opts.keyed ? 'KeyedAddressRateLimiter' : 'AddressRateLimiter'} binding is not configured`,
			)
			return c.json({ error: 'Service misconfigured' }, 503)
		}

		try {
			const clonedRequest = await cloneRawRequest(c.req)
			const rawBody = z.safeParse(
				z.object({
					jsonrpc: z.string(),
					id: z.number(),
					method: z.string(),
					params: z.optional(z.array(z.unknown())),
				}),
				await clonedRequest.json(),
			)
			if (!rawBody.success) return c.json({ error: 'Bad request' }, 400)

			const request = RpcRequest.from(rawBody.data)
			c.set('rpcMethod', request.method)
			const parameters = request.params?.[0]
			let transaction:
				| {
						to?: string
						calls?: Array<{ to?: string }>
						gas?: bigint
						maxFeePerGas?: bigint
				  }
				| undefined

			if (
				typeof parameters === 'string' &&
				(parameters.startsWith('0x76') || parameters.startsWith('0x78'))
			) {
				if (!Hex.validate(parameters) || parameters.length < 100)
					return c.json({ error: 'Bad request' }, 400)
				transaction = Transaction.deserialize(parameters) as {
					to?: string
					calls?: Array<{ to?: string }>
					gas?: bigint
					maxFeePerGas?: bigint
				}
			} else if (rawBody.data.method === 'eth_fillTransaction') {
				const fillResult = z.safeParse(FillTransaction, parameters)
				if (!fillResult.success) return c.json({ error: 'Bad request' }, 400)
				const fill = fillResult.data
				if (typeof fill.feePayer === 'string')
					return c.json(
						{ error: 'External fee payer URLs are not allowed' },
						400,
					)

				if (fill.feePayer !== false) {
					transaction = {}
					if (fill.to) transaction.to = fill.to
					if (fill.calls) transaction.calls = fill.calls
				}
			}

			if (transaction) {
				const clientIp = c.req.header('cf-connecting-ip') ?? 'unknown'
				const { success } = await limiter.limit({ key: clientIp })
				if (!success) return c.json({ error: 'Rate limit exceeded' }, 429)

				// Expose an upper-bound fee estimate for analytics. This is
				// `gasLimit * maxFeePerGas` (the user's authorized ceiling),
				// not the actual fee paid — see dashboard note.
				if (transaction.gas && transaction.maxFeePerGas) {
					const feeAtto = transaction.gas * transaction.maxFeePerGas
					c.set('estimatedFeeUsd', Number(formatUnits(feeAtto, 18)))
				}

				// API-key-scoped checks: [REDACTED:api-key] allowlist + daily budget.
				const apiKey = c.get('apiKey') as string | undefined
				const apiKeyRecord = c.get('apiKeyRecord') as ApiKeyRecord | undefined
				if (apiKey && apiKeyRecord) {
					if (apiKeyRecord.allowedDestinations.length > 0) {
						const destinations = transaction.calls
							? transaction.calls.map((call) => call.to)
							: [transaction.to]
						const allowedDestinations = new Set(
							apiKeyRecord.allowedDestinations.map((address) =>
								address.toLowerCase(),
							),
						)
						const destinationsAllowed =
							destinations.length > 0 &&
							destinations.every(
								(destination) =>
									destination &&
									allowedDestinations.has(destination.toLowerCase()),
							)
						if (!destinationsAllowed) {
							return c.json(
								{ error: 'Destination address not allowed for this API key' },
								403,
							)
						}
					}

					if (transaction.gas && transaction.maxFeePerGas) {
						const budget = await checkBudget(
							apiKey,
							apiKeyRecord,
							transaction.gas,
							transaction.maxFeePerGas,
						)
						if (!budget.allowed) {
							return c.json({ error: budget.reason }, 429)
						}

						// Record spend after request completes successfully.
						c.executionCtx.waitUntil(
							recordSpend(apiKey, transaction.gas, transaction.maxFeePerGas),
						)
					}
				}
			}
		} catch (error) {
			console.error('Rate limit middleware error:', error)
			return c.json({ error: 'Bad request' }, 400)
		}

		await next()
	}
}
