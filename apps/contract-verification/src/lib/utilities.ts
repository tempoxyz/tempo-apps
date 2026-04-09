import type { Context } from 'hono'
import { type Address, Hex } from 'ox'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { getDatabaseLogger, getLogger } from '#lib/logger.ts'

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

/**
 * Checks if an origin matches an allowed hostname pattern.
 * pathname and search parameters are ignored
 */
export type CreationTransactionMetadata = {
	transactionHash: Uint8Array
	blockNumber: number
	transactionIndex: number
	deployer: Uint8Array
}

export async function getCreationTransactionMetadata(options: {
	creationTransactionHash: string
	address: string
	chainId: number
	client: {
		getTransactionReceipt?: (args: { hash: Hex.Hex }) => Promise<{
			transactionHash: Hex.Hex
			blockNumber: bigint
			transactionIndex: number
			from: Address.Address
			contractAddress?: string | null
		}>
	}
	logContext?: Record<string, unknown>
}): Promise<CreationTransactionMetadata | null> {
	const { creationTransactionHash, address, chainId, client, logContext } =
		options
	if (!client.getTransactionReceipt) return null
	try {
		Hex.assert(creationTransactionHash)
		const receipt = await client.getTransactionReceipt({
			hash: creationTransactionHash,
		})

		if (
			receipt.contractAddress &&
			receipt.contractAddress.toLowerCase() === address.toLowerCase()
		) {
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
