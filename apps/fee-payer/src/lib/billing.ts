import { env } from 'cloudflare:workers'
import { Bytes, Hash, Hex } from 'ox'
import { type TempoAddress, Transaction, TxEnvelopeTempo } from 'ox/tempo'

type JsonRpcRequest = {
	method: string
	params?: readonly unknown[] | undefined
}

type JsonRpcResponse = {
	error?: unknown
	result?: unknown
}

type SponsorshipDetails = {
	chainId: number
	feePayerPayloadHash: `0x${string}`
	feePayerSignature?: unknown
}

export type SponsorshipIntentMessage = {
	type: 'sponsorship_intent'
	event: {
		idempotencyKey: string
		apiKeyHash: string
		attributionKey?: string
		chainId: number
		sponsorAddress: string
		feePayerPayloadHash: `0x${string}`
		feePayerSignature?: unknown
		signedAt: string
	}
}

type BuildSponsorshipIntentMessageOptions = {
	apiKey: string
	attributionKey?: string | undefined
	fallbackChainId: number
	requestBody: unknown
	responseBody: unknown
	signedAt?: string | undefined
	sponsorAddress: string
}

type EnqueueSponsorshipIntentOptions = {
	apiKey: string
	attributionKey?: string | undefined
	fallbackChainId: number
	request: Request
	response: Response
	signedAt?: string | undefined
	sponsorAddress: string
}

type BillingEnv = {
	BILLING_QUEUE?: Queue<SponsorshipIntentMessage> | undefined
}

/** Enqueues a billing sponsorship intent from a successful fee-payer response. */
export async function enqueueSponsorshipIntent(
	options: EnqueueSponsorshipIntentOptions,
) {
	const queue = (env as Cloudflare.Env & BillingEnv).BILLING_QUEUE
	if (!queue) return

	try {
		const [requestBody, responseBody] = await Promise.all([
			options.request.json(),
			options.response.json(),
		])
		const message = buildSponsorshipIntentMessage({
			apiKey: options.apiKey,
			attributionKey: options.attributionKey,
			fallbackChainId: options.fallbackChainId,
			requestBody,
			responseBody,
			signedAt: options.signedAt,
			sponsorAddress: options.sponsorAddress,
		})
		if (!message) return

		await queue.send(message, { contentType: 'json' })
	} catch (error) {
		console.error('fee_payer.billing.sponsorship_intent_failed', error)
	}
}

/** Builds the billing queue message accepted by billing-srv. */
export function buildSponsorshipIntentMessage(
	options: BuildSponsorshipIntentMessageOptions,
): SponsorshipIntentMessage | null {
	const request = parseRpcRequest(options.requestBody)
	const response = parseRpcResponse(options.responseBody)
	if (!request || !response || response.error) return null

	const details = sponsorshipDetailsFromRpc(
		request,
		response,
		options.fallbackChainId,
	)
	if (!details) return null

	const apiKeyHash = hashApiKey(options.apiKey)
	const idempotencyKey = sponsorshipIdempotencyKey({
		apiKeyHash,
		chainId: details.chainId,
		feePayerPayloadHash: details.feePayerPayloadHash,
		sponsorAddress: options.sponsorAddress,
	})

	return {
		type: 'sponsorship_intent',
		event: {
			idempotencyKey,
			apiKeyHash,
			...(options.attributionKey
				? { attributionKey: options.attributionKey }
				: {}),
			chainId: details.chainId,
			sponsorAddress: options.sponsorAddress,
			feePayerPayloadHash: details.feePayerPayloadHash,
			...(typeof details.feePayerSignature !== 'undefined'
				? { feePayerSignature: details.feePayerSignature }
				: {}),
			signedAt: options.signedAt ?? new Date().toISOString(),
		},
	}
}

/** Hashes the raw API key before sending it to billing-srv. */
export function hashApiKey(apiKey: string): string {
	return Hex.fromBytes(Hash.sha256(Bytes.fromString(apiKey)))
}

function sponsorshipDetailsFromRpc(
	request: JsonRpcRequest,
	response: JsonRpcResponse,
	fallbackChainId: number,
): SponsorshipDetails | null {
	if (request.method === 'eth_fillTransaction')
		return sponsorshipDetailsFromFill(request, response, fallbackChainId)

	return null
}

function sponsorshipDetailsFromFill(
	request: JsonRpcRequest,
	response: JsonRpcResponse,
	fallbackChainId: number,
): SponsorshipDetails | null {
	const result = asRecord(response.result)
	const tx = asRecord(result?.tx)
	if (!tx?.feePayerSignature) return null

	const requestTx = asRecord(request.params?.[0])
	const sender = stringValue(tx.from) ?? stringValue(requestTx?.from)
	if (!sender) return null

	const chainId =
		numberValue(tx.chainId) ??
		numberValue(requestTx?.chainId) ??
		fallbackChainId
	const envelope = buildFeePayerEnvelope({
		chainId,
		requestTx,
		tx,
	})

	return {
		chainId,
		feePayerPayloadHash: TxEnvelopeTempo.getFeePayerSignPayload(envelope, {
			sender: sender as TempoAddress.Address,
		}),
		feePayerSignature: tx.feePayerSignature,
	}
}

function buildFeePayerEnvelope(options: {
	chainId: number
	requestTx: Record<string, unknown> | undefined
	tx: Record<string, unknown>
}) {
	const merged = { ...options.requestTx, ...options.tx }
	const transaction = { ...merged }
	delete transaction.data
	delete transaction.input
	delete transaction.to
	delete transaction.value

	return TxEnvelopeTempo.from(
		Transaction.fromRpc({
			...transaction,
			calls: mergeCalls(options.requestTx, options.tx),
			chainId: Hex.fromNumber(options.chainId),
			nonceKey: emptyHexAsUndefined(transaction.nonceKey),
			type: '0x76',
			validAfter: emptyHexAsUndefined(transaction.validAfter),
			validBefore: emptyHexAsUndefined(transaction.validBefore),
		} as never) as never,
	)
}

function mergeCalls(
	requestTx: Record<string, unknown> | undefined,
	tx: Record<string, unknown>,
) {
	const fallbackCalls =
		recordArrayValue(requestTx?.calls) ??
		recordArrayValue(callsFromLegacyRequest(requestTx))
	const responseCalls = recordArrayValue(tx.calls)

	if (!responseCalls) return fallbackCalls

	return responseCalls.map((call, index) => ({
		...fallbackCalls?.[index],
		...call,
	}))
}

function parseRpcRequest(value: unknown): JsonRpcRequest | null {
	const request = asRecord(value)
	if (!request || typeof request.method !== 'string') return null
	return {
		method: request.method,
		params: Array.isArray(request.params) ? request.params : undefined,
	}
}

function parseRpcResponse(value: unknown): JsonRpcResponse | null {
	const response = asRecord(value)
	if (!response) return null
	return {
		error: response.error,
		result: response.result,
	}
}

function sponsorshipIdempotencyKey(options: {
	apiKeyHash: string
	chainId: number
	feePayerPayloadHash: string
	sponsorAddress: string
}) {
	const digest = Hex.fromBytes(
		Hash.keccak256(
			Bytes.fromString(
				[
					options.apiKeyHash.toLowerCase(),
					options.chainId,
					options.sponsorAddress.toLowerCase(),
					options.feePayerPayloadHash.toLowerCase(),
				].join(':'),
			),
		),
	)
	return `sintent_${digest.slice(2)}`
}

function callsFromLegacyRequest(request: Record<string, unknown> | undefined) {
	if (!request) return undefined
	if (
		typeof request.to === 'undefined' &&
		typeof request.data === 'undefined' &&
		typeof request.value === 'undefined'
	)
		return undefined

	return [
		{
			...(typeof request.to !== 'undefined' ? { to: request.to } : {}),
			...(typeof request.data !== 'undefined' ? { data: request.data } : {}),
			...(typeof request.value !== 'undefined' ? { value: request.value } : {}),
		},
	]
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'bigint') return Number(value)
	if (typeof value !== 'string') return undefined

	const parsed =
		value === '0x'
			? 0
			: Hex.validate(value)
				? Hex.toNumber(value)
				: Number(value)
	if (!Number.isFinite(parsed)) return undefined
	return parsed
}

function emptyHexAsUndefined(value: unknown): unknown {
	return value === '0x' ? undefined : value
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return undefined
	return value as Record<string, unknown>
}

function recordArrayValue(
	value: unknown,
): Array<Record<string, unknown>> | undefined {
	if (!Array.isArray(value)) return undefined
	return value.flatMap((item) => {
		const record = asRecord(item)
		return record ? [record] : []
	})
}
