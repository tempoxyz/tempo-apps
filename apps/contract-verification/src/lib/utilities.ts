import type { Context } from 'hono'
import { Address, Hex } from 'ox'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { getDatabaseLogger, getLogger } from '#lib/logger.ts'
import { creationTraceOptions } from '#lib/rpc.ts'

const dbLogger = getDatabaseLogger()

export const getDb = (d1: D1Database) => drizzle(d1, { logger: dbLogger })

export function formatError(error: unknown): {
	type: string
	message: string
	stack?: string
} {
	if (error instanceof Error)
		return {
			type: error.name,
			message: error.message,
			stack: error.stack,
		}

	return { type: 'Unknown', message: String(error) }
}

const logger = getLogger(['tempo'])

/**
 * Normalize absolute source paths to relative paths.
 * Extracts the portion after common patterns like /src/, /contracts/, /lib/
 * Falls back to filename if no pattern matches.
 */
export function normalizeSourcePath(absolutePath: string) {
	if (!absolutePath.startsWith('/')) return absolutePath

	// Common source directory patterns
	const patterns = ['/src/', '/contracts/', '/lib/', '/test/', '/script/']

	for (const pattern of patterns) {
		const index = absolutePath.lastIndexOf(pattern)
		if (index !== -1) return absolutePath.slice(index + 1) // +1 to remove leading slash
	}

	// Fallback: just use the filename
	const parts = absolutePath.split('/')
	return parts.at(-1) ?? absolutePath
}

export function getCompilerMetadataSourcePaths(
	metadata: string | undefined,
): Set<string> {
	if (!metadata) return new Set()

	let parsedMetadata: unknown
	try {
		parsedMetadata = JSON.parse(metadata)
	} catch {
		return new Set()
	}

	if (typeof parsedMetadata !== 'object' || parsedMetadata === null) {
		return new Set()
	}

	const sources = (parsedMetadata as { sources?: unknown }).sources
	if (
		typeof sources !== 'object' ||
		sources === null ||
		Array.isArray(sources)
	) {
		return new Set()
	}

	return new Set(Object.keys(sources))
}

export function filterSourcesByCompilerMetadata<T>(
	sources: Record<string, T>,
	metadata: string | undefined,
): Array<[string, T]> | null {
	const metadataSourcePaths = getCompilerMetadataSourcePaths(metadata)
	const normalizedPaths = new Set<string>()
	const entries: Array<[string, T]> = []
	for (const [sourcePath, source] of Object.entries(sources)) {
		if (!metadataSourcePaths.has(sourcePath)) continue
		const path = normalizeSourcePath(sourcePath)
		if (normalizedPaths.has(path)) return null
		normalizedPaths.add(path)
		entries.push([path, source])
	}
	return entries
}

export function sourcifyError(
	context: Context,
	status: ContentfulStatusCode,
	customCode: string,
	message: string,
) {
	const requestId =
		typeof context.get === 'function'
			? ((context.get('requestId') as string | undefined) ?? undefined)
			: undefined
	const errorId = requestId ?? globalThis.crypto.randomUUID()

	if (status >= 400 && status < 500) {
		logger.warn('http_client_error_response', {
			status,
			customCode,
			message,
			errorId,
		})
	}

	return context.json(
		{
			message,
			customCode,
			errorId,
		},
		status,
	)
}

export interface AppErrorOptions {
	status: ContentfulStatusCode
	code: string
	message: string
	cause?: unknown
	context?: Record<string, unknown>
}

export class AppError extends HTTPException {
	readonly code: string
	readonly context: Record<string, unknown>

	constructor(options: AppErrorOptions) {
		super(options.status, { message: options.message, cause: options.cause })
		this.code = options.code
		this.context = options.context ?? {}
	}

	toJSON(errorId?: string) {
		return {
			message: this.message,
			customCode: this.code,
			errorId: errorId ?? globalThis.crypto.randomUUID(),
		}
	}
}

const VALIDATION_ERROR_NAMES = new Set([
	'InvalidAddressError',
	'Address.InvalidAddressError',
	'InvalidHexValueError',
	'InvalidHexLengthError',
])

function isValidationError(error: Error): boolean {
	return VALIDATION_ERROR_NAMES.has(error.name)
}

export function handleError(error: Error, context: Context) {
	const requestId = context.get('requestId') as string | undefined
	const errorId = requestId ?? globalThis.crypto.randomUUID()

	if (error instanceof AppError) {
		logger.warn('app_error', {
			status: error.status,
			customCode: error.code,
			errorId,
			...error.context,
			cause: error.cause ? formatError(error.cause) : undefined,
		})
		return context.json(error.toJSON(errorId), error.status)
	}

	if (error instanceof HTTPException) {
		logger.warn('http_exception', {
			status: error.status,
			errorId,
			cause: error.cause ? formatError(error.cause) : undefined,
		})
		return error.getResponse()
	}

	if (isValidationError(error)) {
		logger.warn('validation_error', {
			errorId,
			error: formatError(error),
		})
		return context.json(
			{
				message: error.message,
				customCode: 'validation_error',
				errorId,
			},
			400,
		)
	}

	const doMeta = extractDurableObjectErrorMeta(error)
	logger.error('unhandled_error', {
		errorId,
		error: formatError(error),
		...doMeta,
	})
	return context.json(
		{
			message: 'An unexpected error occurred',
			customCode: 'internal_error',
			errorId,
		},
		500,
	)
}

function extractDurableObjectErrorMeta(
	error: unknown,
): Record<string, unknown> {
	if (!error || !(typeof error === 'object')) return {}

	const e = error as Record<string, unknown>
	const meta: Record<string, unknown> = {}
	if ('remote' in e) meta.remote = e.remote
	if ('retryable' in e) meta.retryable = e.retryable
	if ('overloaded' in e) meta.overloaded = e.overloaded
	return meta
}

/** Mined transaction metadata for a proven contract creation. */
export type CreationTransactionMetadata = {
	transactionHash: Uint8Array
	blockNumber: number
	transactionIndex: number
	deployer: Uint8Array
}

/** Receipt and trace reads from the selected chain's trusted RPC transport. */
export type CreationTransactionClient = {
	getTransactionReceipt?: (args: { hash: Hex.Hex }) => Promise<{
		transactionHash: Hex.Hex
		blockNumber: bigint
		transactionIndex: number
		from: Address.Address
		contractAddress?: string | null
		cumulativeGasUsed?: bigint
		status: 'success' | 'reverted'
	}>
	transport?: {
		request: (args: {
			method: 'debug_traceTransaction'
			params: [Hex.Hex, typeof creationTraceOptions]
		}) => Promise<unknown>
	}
}

/** Returns creation metadata, requiring a surviving creation with matching output when a stored runtime is supplied. */
export async function getCreationTransactionMetadata(options: {
	creationTransactionHash: string
	address: string
	chainId: number
	client: CreationTransactionClient
	/** Recorded effective runtime that the successful creation must return. */
	expectedRuntime?: Hex.Hex | undefined
	logContext?: Record<string, unknown>
}): Promise<CreationTransactionMetadata | null> {
	const {
		creationTransactionHash,
		address,
		chainId,
		client,
		expectedRuntime,
		logContext,
	} = options
	if (!client.getTransactionReceipt) return null
	try {
		if (expectedRuntime !== undefined) {
			Hex.assert(expectedRuntime, { strict: true })
			if (expectedRuntime === '0x' || expectedRuntime.length % 2 !== 0)
				throw new Error(
					'Expected runtime must contain complete nonempty bytecode',
				)
		}
		Hex.assert(creationTransactionHash, { strict: true })
		if (
			Hex.size(creationTransactionHash) !== 32 ||
			!Address.validate(address, { strict: false })
		)
			throw new Error('Invalid creation transaction hash or contract address')
		const receipt = await client.getTransactionReceipt({
			hash: creationTransactionHash,
		})

		if (
			receipt.status !== 'success' ||
			receipt.transactionHash.toLowerCase() !==
				creationTransactionHash.toLowerCase() ||
			typeof receipt.blockNumber !== 'bigint' ||
			receipt.blockNumber < 0n ||
			!Number.isSafeInteger(Number(receipt.blockNumber)) ||
			!Number.isSafeInteger(receipt.transactionIndex) ||
			receipt.transactionIndex < 0 ||
			!Address.validate(receipt.from, { strict: false })
		)
			throw new Error('Creation transaction receipt is invalid or unsuccessful')

		const directCreation =
			receipt.contractAddress?.toLowerCase() === address.toLowerCase()
		const requiresTrace = expectedRuntime !== undefined || !directCreation
		// Reth's built-in tracers ignore timeout; cap replay through this transaction before asking it to trace.
		if (
			requiresTrace &&
			(typeof receipt.cumulativeGasUsed !== 'bigint' ||
				receipt.cumulativeGasUsed <= 0n ||
				receipt.cumulativeGasUsed > 50_000_000n)
		)
			throw new Error('Creation transaction exceeds the trace replay budget')
		// Receipts prove an address, but repairs also need runtime and same-transaction destruction evidence.
		const tracedCreation =
			requiresTrace && client.transport
				? traceCreatesContract(
						await client.transport.request({
							method: 'debug_traceTransaction',
							params: [creationTransactionHash, creationTraceOptions],
						}),
						address,
						expectedRuntime,
					)
				: false
		if ((!requiresTrace && directCreation) || tracedCreation) {
			return {
				transactionHash: Hex.toBytes(receipt.transactionHash),
				blockNumber: Number(receipt.blockNumber),
				transactionIndex: receipt.transactionIndex,
				deployer: Hex.toBytes(receipt.from),
			}
		}
		logger.warn('creation_transaction_hash_mismatch', {
			chainId,
			address,
			creationTransactionHash,
			receiptContractAddress: receipt.contractAddress,
			...logContext,
		})
		return null
	} catch (error) {
		logger.warn('creation_transaction_hash_lookup_failed', {
			error: formatError(error),
			chainId,
			address,
			creationTransactionHash,
			...logContext,
		})
		return null
	}
}

function traceCreatesContract(
	trace: unknown,
	address: string,
	expectedRuntime?: Hex.Hex,
): boolean {
	const frames = [{ value: trace, reverted: false }]
	let found = false
	let count = 0
	while (frames.length > 0) {
		// Bound untrusted RPC trees and avoid recursion through deeply nested EVM calls.
		if (++count > 10_000) return false
		const next = frames.pop()
		if (!next) return false
		const { value, reverted } = next
		if (!value || typeof value !== 'object' || Array.isArray(value))
			return false
		const frame = value as Record<string, unknown>
		if (
			typeof frame.type !== 'string' ||
			![
				'CALL',
				'CALLCODE',
				'DELEGATECALL',
				'STATICCALL',
				'CREATE',
				'CREATE2',
				'SELFDESTRUCT',
			].includes(frame.type) ||
			typeof frame.from !== 'string' ||
			!Address.validate(frame.from, { strict: false }) ||
			(frame.to !== undefined &&
				(typeof frame.to !== 'string' ||
					!Address.validate(frame.to, { strict: false }))) ||
			(frame.error !== undefined && typeof frame.error !== 'string') ||
			(frame.revertReason !== undefined &&
				typeof frame.revertReason !== 'string') ||
			(frame.calls !== undefined && !Array.isArray(frame.calls))
		)
			return false
		// A successful child creation is rolled back when any ancestor reverts, even if the transaction succeeds.
		const failed =
			reverted || frame.error !== undefined || frame.revertReason !== undefined
		if (!failed && typeof frame.to !== 'string') return false
		// A target created and destroyed in the same transaction never persists, even under EIP-6780.
		if (
			!failed &&
			frame.type === 'SELFDESTRUCT' &&
			frame.from.toLowerCase() === address.toLowerCase()
		)
			return false
		if (
			!failed &&
			(frame.type === 'CREATE' || frame.type === 'CREATE2') &&
			typeof frame.to === 'string' &&
			frame.to.toLowerCase() === address.toLowerCase()
		) {
			if (
				expectedRuntime !== undefined &&
				(found ||
					typeof frame.output !== 'string' ||
					frame.output.toLowerCase() !== expectedRuntime.toLowerCase())
			)
				return false
			found = true
		}
		for (const child of (frame.calls ?? []) as unknown[])
			frames.push({ value: child, reverted: failed })
	}
	return found
}

/** Checks whether an origin matches an allowed hostname pattern, ignoring path and query. */
export function originMatches(params: { origin: string; pattern: string }) {
	if (env.NODE_ENV === 'development') return true

	const { pattern } = params

	if (!params.origin) return false
	let origin: string

	try {
		const stripExtra = new URL(params.origin)
		origin = `${stripExtra.protocol}//${stripExtra.hostname}`
	} catch {
		return false
	}

	if (origin === pattern) return true
	if (!pattern.includes('*')) return false

	return new RegExp(
		`^${pattern.replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`).replaceAll('*', '.*')}$`,
	).test(origin)
}
