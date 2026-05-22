import { env } from 'cloudflare:workers'
import type { Context, Next } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { Hex, RpcRequest } from 'ox'
import { formatUnits } from 'viem'
import { Transaction } from 'viem/tempo'
import * as z from 'zod/mini'
import type { ApiKeyRecord } from './api-keys.js'
import { checkBudget, recordSpend } from './api-key-budget.js'

type SponsorshipTransaction = {
	from?: string
	to?: string
	calls?: Array<{ to?: string }>
	gas?: bigint
	maxFeePerGas?: bigint
}

type TransactionParseError = {
	error: string
	status: 400 | 502
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isTransactionParseError(
	value: SponsorshipTransaction | TransactionParseError,
): value is TransactionParseError {
	return 'error' in value
}

function parseBigInt(value: unknown): bigint | null {
	if (typeof value === 'bigint') return value
	if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value)
	if (typeof value !== 'string') return null

	try {
		return BigInt(value)
	} catch {
		return null
	}
}

function parseOptionalPositiveBigInt(
	record: Record<string, unknown>,
	field: 'gas' | 'maxFeePerGas',
	status: TransactionParseError['status'],
): bigint | undefined | TransactionParseError {
	if (!Object.hasOwn(record, field)) return undefined

	const parsed = parseBigInt(record[field])
	if (parsed === null || parsed <= 0n) {
		return { error: `Invalid ${field}`, status }
	}

	return parsed
}

function transactionFromRequest(
	request: Record<string, unknown>,
	status: TransactionParseError['status'] = 400,
): SponsorshipTransaction | TransactionParseError {
	const calls = Array.isArray(request.calls)
		? request.calls.filter(isRecord).map((call) => ({
				to: typeof call.to === 'string' ? call.to : undefined,
			}))
		: undefined

	const gas = parseOptionalPositiveBigInt(request, 'gas', status)
	if (typeof gas === 'object') return gas
	const maxFeePerGas = parseOptionalPositiveBigInt(
		request,
		'maxFeePerGas',
		status,
	)
	if (typeof maxFeePerGas === 'object') return maxFeePerGas

	return {
		from: typeof request.from === 'string' ? request.from : undefined,
		to: typeof request.to === 'string' ? request.to : undefined,
		calls,
		gas,
		maxFeePerGas,
	}
}

function transactionFromFillResponse(
	body: unknown,
): SponsorshipTransaction | TransactionParseError | null {
	if (!isRecord(body))
		return { error: 'Malformed relay fill response', status: 502 }
	if ('error' in body) return null
	if (!isRecord(body.result) || !isRecord(body.result.tx)) {
		return { error: 'Malformed relay fill response', status: 502 }
	}

	const transaction = transactionFromRequest(body.result.tx, 502)
	if (isTransactionParseError(transaction)) {
		return { error: 'Malformed relay fill response', status: 502 }
	}
	if (!transaction.gas || !transaction.maxFeePerGas) {
		return { error: 'Malformed relay fill response', status: 502 }
	}

	return transaction
}

async function transactionFromResponse(
	response: Response,
): Promise<SponsorshipTransaction | TransactionParseError | null> {
	try {
		return transactionFromFillResponse(await response.clone().json())
	} catch {
		if (response.ok) {
			return { error: 'Malformed relay fill response', status: 502 }
		}
		return null
	}
}

function mergeTransactions(
	request: SponsorshipTransaction,
	filled: SponsorshipTransaction,
): SponsorshipTransaction {
	return {
		...request,
		...filled,
		from: filled.from ?? request.from,
		to: filled.to ?? request.to,
		calls: filled.calls ?? request.calls,
		gas: filled.gas ?? request.gas,
		maxFeePerGas: filled.maxFeePerGas ?? request.maxFeePerGas,
	}
}

async function enforceApiKeyControls(
	c: Context,
	apiKey: string,
	apiKeyRecord: ApiKeyRecord,
	transaction: SponsorshipTransaction,
	opts: { recordSpend: boolean },
): Promise<Response | null> {
	// Tempo envelopes nest the destination under `calls[0].to`; legacy
	// envelopes use top-level `to`.
	const to = transaction.calls?.[0]?.to ?? transaction.to

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

		if (opts.recordSpend) {
			// Record spend after request completes successfully.
			c.executionCtx.waitUntil(
				recordSpend(apiKey, transaction.gas, transaction.maxFeePerGas),
			)
		}
	}

	return null
}

/**
 * Middleware that rate limits requests based on the transaction's `from` address.
 * Extracts the transaction from the RPC request and checks against the rate limiter.
 * Fails closed: rejects requests when the binding is missing, the sender cannot
 * be identified, or the request body is malformed.
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
 * Applies to requests carrying a serialized 0x76/0x78 Tempo transaction or
 * an `eth_fillTransaction` transaction object. Non-transaction RPC calls
 * (e.g. eth_chainId) pass through to the handler.
 */
export function rateLimitMiddleware(opts: { keyed: boolean }) {
	return async (c: Context, next: Next) => {
		const apiKey = c.get('apiKey') as string | undefined
		const useKeyedLimiter = opts.keyed || Boolean(apiKey)
		const limiter = useKeyedLimiter
			? (env.KeyedAddressRateLimiter ?? env.AddressRateLimiter)
			: env.AddressRateLimiter
		if (!limiter) {
			console.error(
				`${useKeyedLimiter ? 'KeyedAddressRateLimiter' : 'AddressRateLimiter'} binding is not configured`,
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
			const rpcMethod = rawBody.data.method
			c.set('rpcMethod', rpcMethod)
			const transactionParam = request.params?.[0]
			const transaction = (() => {
				if (
					typeof transactionParam === 'string' &&
					(transactionParam.startsWith('0x76') ||
						transactionParam.startsWith('0x78'))
				) {
					if (!Hex.validate(transactionParam) || transactionParam.length < 100)
						return 'malformed'
					return Transaction.deserialize(
						transactionParam,
					) as SponsorshipTransaction
				}

				if (rpcMethod === 'eth_fillTransaction' && isRecord(transactionParam)) {
					return transactionFromRequest(transactionParam)
				}

				return null
			})()

			if (transaction === 'malformed')
				return c.json({ error: 'Bad request' }, 400)
			if (transaction && isTransactionParseError(transaction)) {
				return c.json({ error: transaction.error }, transaction.status)
			}

			if (transaction) {
				const from = transaction.from
				if (!from) {
					return c.json(
						{ error: 'Unable to determine sender for rate limiting' },
						400,
					)
				}

				const { success } = await limiter.limit({ key: from })
				if (!success) return c.json({ error: 'Rate limit exceeded' }, 429)

				// Expose an upper-bound fee estimate for analytics. This is
				// `gasLimit * maxFeePerGas` (the user's authorized ceiling),
				// not the actual fee paid — see dashboard note.
				if (transaction.gas && transaction.maxFeePerGas) {
					const feeAtto = transaction.gas * transaction.maxFeePerGas
					c.set('estimatedFeeUsd', Number(formatUnits(feeAtto, 18)))
				}

				// API-key-scoped checks: [REDACTED:api-key] allowlist + daily budget.
				const apiKeyRecord = c.get('apiKeyRecord') as ApiKeyRecord | undefined
				if (apiKey && apiKeyRecord) {
					const blocked = await enforceApiKeyControls(
						c,
						apiKey,
						apiKeyRecord,
						transaction,
						{ recordSpend: rpcMethod !== 'eth_fillTransaction' },
					)
					if (blocked) return blocked
				}

				await next()

				if (rpcMethod === 'eth_fillTransaction' && apiKey && apiKeyRecord) {
					const filledTransaction = await transactionFromResponse(c.res)
					if (filledTransaction && isTransactionParseError(filledTransaction)) {
						c.res = c.json(
							{ error: filledTransaction.error },
							filledTransaction.status,
						)
						return
					}
					if (filledTransaction) {
						const blocked = await enforceApiKeyControls(
							c,
							apiKey,
							apiKeyRecord,
							mergeTransactions(transaction, filledTransaction),
							{ recordSpend: true },
						)
						if (blocked) c.res = blocked
					}
				}
				return
			}
		} catch (error) {
			console.error('Rate limit middleware error:', error)
			return c.json({ error: 'Bad request' }, 400)
		}

		await next()
	}
}
