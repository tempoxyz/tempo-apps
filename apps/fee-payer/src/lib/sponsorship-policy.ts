import type { Context, Next } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { Hex, RpcRequest } from 'ox'
import { formatUnits } from 'viem'
import { Transaction } from 'viem/tempo'
import * as z from 'zod/mini'
import type { ApiKeyRecord } from './api-keys.js'
import { checkBudget, recordSpend } from './api-key-budget.js'

/** Enforce API-key policy for serialized sponsorship transactions. */
export async function sponsorshipPolicyMiddleware(c: Context, next: Next) {
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
				to?: string
				calls?: Array<{ to?: string }>
				gas?: bigint
				maxFeePerGas?: bigint
			}
			const destinations = transaction.calls?.length
				? transaction.calls.map((call) => call.to)
				: [transaction.to]
			const gas = transaction.gas
			const maxFeePerGas = transaction.maxFeePerGas

			if (gas != null && maxFeePerGas != null)
				c.set('estimatedFeeUsd', Number(formatUnits(gas * maxFeePerGas, 18)))

			const apiKey = c.get('apiKey') as string | undefined
			const apiKeyRecord = c.get('apiKeyRecord') as ApiKeyRecord | undefined
			if (apiKey && apiKeyRecord) {
				// Enforce destination address allowlist
				if (apiKeyRecord.allowedDestinations.length > 0) {
					const allowed = new Set(
						apiKeyRecord.allowedDestinations.map((address) => address.toLowerCase()),
					)
					const allAllowed =
						destinations.length > 0 &&
						destinations.every(
							(destination) =>
								destination != null && allowed.has(destination.toLowerCase()),
						)
					if (!allAllowed)
						return c.json(
							{ error: 'Destination address not allowed for this API key' },
							403,
						)
				}

				// Enforce fee budget limit
				if (gas != null && maxFeePerGas != null) {
					const budget = await checkBudget(apiKey, apiKeyRecord, gas, maxFeePerGas)
					if (!budget.allowed) return c.json({ error: budget.reason }, 429)

					c.executionCtx.waitUntil(recordSpend(apiKey, gas, maxFeePerGas))
				} else if (apiKeyRecord.dailyLimitUsd) {
					return c.json(
						{ error: 'Transaction fee could not be determined for budget enforcement' },
						400,
					)
				}
			}
		}
	} catch (error) {
		console.error('Sponsorship policy middleware error:', error)
		return c.json({ error: 'Bad request' }, 400)
	}

	await next()
}