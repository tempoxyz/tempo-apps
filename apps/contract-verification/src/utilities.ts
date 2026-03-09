import type { Context } from 'hono'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { getDatabaseLogger, getLogger } from '#logger.ts'

const dbLogger = getDatabaseLogger()

export function getDb(d1: D1Database) {
	return drizzle(d1, { logger: dbLogger })
}

export function formatError(error: unknown): {
	type: string
	message: string
	stack?: string
} {
	if (error instanceof Error) {
		return {
			type: error.name,
			message: error.message,
			stack: error.stack,
		}
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
	return context.json(
		{
			message,
			customCode,
			errorId: globalThis.crypto.randomUUID(),
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

	toJSON() {
		return {
			message: this.message,
			customCode: this.code,
			errorId: globalThis.crypto.randomUUID(),
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

	if (error instanceof AppError) {
		logger.warn(error.code, {
			...error.context,
			cause: error.cause ? formatError(error.cause) : undefined,
		})
		return context.json(error.toJSON(), error.status)
	}

	if (error instanceof HTTPException) {
		logger.warn('http_exception', {
			status: error.status,
			cause: error.cause ? formatError(error.cause) : undefined,
		})
		return error.getResponse()
	}

	if (isValidationError(error)) {
		logger.warn('validation_error', { error: formatError(error) })
		return context.json(
			{
				message: error.message,
				customCode: 'validation_error',
				errorId: requestId ?? globalThis.crypto.randomUUID(),
			},
			400,
		)
	}

	const doMeta = extractDurableObjectErrorMeta(error)
	logger.error('unhandled_error', { error: formatError(error), ...doMeta })
	return context.json(
		{
			message: 'An unexpected error occurred',
			customCode: 'internal_error',
			errorId: requestId ?? globalThis.crypto.randomUUID(),
		},
		500,
	)
}

function extractDurableObjectErrorMeta(
	error: unknown,
): Record<string, unknown> {
	if (error && typeof error === 'object') {
		const e = error as Record<string, unknown>
		const meta: Record<string, unknown> = {}
		if ('remote' in e) meta.remote = e.remote
		if ('retryable' in e) meta.retryable = e.retryable
		if ('overloaded' in e) meta.overloaded = e.overloaded
		return meta
	}
	return {}
}

/**
 * Checks if an origin matches an allowed hostname pattern.
 * pathname and search parameters are ignored
 */
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
