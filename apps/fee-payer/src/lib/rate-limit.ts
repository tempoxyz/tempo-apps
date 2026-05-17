import { env } from 'cloudflare:workers'
import type { Context, Next } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { Hex, RpcRequest } from 'ox'
import { Transaction } from 'viem/tempo'
import * as z from 'zod/mini'
import type { ApiKeyRecord } from './api-keys.js'
import { checkBudget, recordSpend } from './api-key-budget.js'

/**
 * Middleware that rate limits requests based on the transaction's `from` address.
 * Extracts the transaction from the RPC request and checks against the rate limiter.
 * Fails closed: rejects requests when the binding is missing, the sender cannot
 * be identified, or the request body is malformed.
 *
 * When an API key is present (set by apiKeyMiddleware), also enforces:
 *  - Per-key daily spend budget
 *  - Allowed destination addresses
 *
 * Only applies to requests carrying a serialized 0x76 Tempo transaction.
 * Non-transaction RPC calls (e.g. eth_chainId) pass through to the handler.
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
	if (!env.AddressRateLimiter) {
		console.error('AddressRateLimiter binding is not configured')
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
		const serialized = request.params?.[0]

		if (
			typeof serialized === 'string' &&
			(serialized.startsWith('0x76') || serialized.startsWith('0x78'))
		) {
			if (!Hex.validate(serialized) || serialized.length < 100)
				return c.json({ error: 'Bad request' }, 400)
			const transaction = Transaction.deserialize(serialized) as {
				from?: string
				to?: string
				calls?: Array<{ to?: string }>
				gas?: bigint
				maxFeePerGas?: bigint
			}
			const from = transaction.from
			// Tempo envelopes nest the destination under `calls[0].to`; legacy
			// envelopes use top-level `to`.
			const to = transaction.calls?.[0]?.to ?? transaction.to

			if (!from) {
				return c.json(
					{ error: 'Unable to determine sender for rate limiting' },
					400,
				)
			}

			const { success } = await env.AddressRateLimiter.limit({ key: from })
			if (!success) return c.json({ error: 'Rate limit exceeded' }, 429)

			// API-key-scoped checks: destination allowlist + daily budget.
			const apiKey = c.get('apiKey') as string | undefined
			const apiKeyRecord = c.get('apiKeyRecord') as ApiKeyRecord | undefined
			if (apiKey && apiKeyRecord) {
				if (apiKeyRecord.allowedDestinations.length > 0 && to) {
					const dest = to.toLowerCase()
					const allowed = apiKeyRecord.allowedDestinations.some(
						(a) => a.toLowerCase() === dest,
					)
					if (!allowed) {
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
