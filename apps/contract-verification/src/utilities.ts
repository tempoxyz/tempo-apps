import type { Context } from 'hono'
import { env } from 'cloudflare:workers'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

type LogLevel = 'info' | 'warn' | 'error'

type LogEvent = {
	level: LogLevel
	event: string
	requestId?: string | undefined
	method?: string | undefined
	path?: string | undefined
	chainId?: string | number | undefined
	address?: string | undefined
	error?: { type: string; message: string; stack?: string } | undefined
	durationMs?: number | undefined
	[key: string]: unknown
}

function formatError(error: unknown): LogEvent['error'] {
	if (error instanceof Error) {
		return {
			type: error.name,
			message: error.message,
			stack: error.stack,
		}
	}
	return { type: 'Unknown', message: String(error) }
}

function emit(event: LogEvent): void {
	const { level, ...rest } = event
	const output = JSON.stringify(rest)
	switch (level) {
		case 'info':
			console.info(output)
			break
		case 'warn':
			console.warn(output)
			break
		case 'error':
			console.error(output)
			break
	}
}

export const log = {
	info(event: string, data: Omit<LogEvent, 'level' | 'event'> = {}): void {
		emit({ level: 'info', event, ...data })
	},
	warn(event: string, data: Omit<LogEvent, 'level' | 'event'> = {}): void {
		emit({ level: 'warn', event, ...data })
	},
	error(
		event: string,
		error: unknown,
		data: Omit<LogEvent, 'level' | 'event' | 'error'> = {},
	): void {
		emit({ level: 'error', event, error: formatError(error), ...data })
	},
	fromContext(context: Context) {
		const base = {
			requestId: context.get('requestId') as string | undefined,
			method: context.req.method,
			path: context.req.path,
		}
		return {
			info(event: string, data: Omit<LogEvent, 'level' | 'event'> = {}): void {
				emit({ level: 'info', event, ...base, ...data })
			},
			warn(event: string, data: Omit<LogEvent, 'level' | 'event'> = {}): void {
				emit({ level: 'warn', event, ...base, ...data })
			},
			error(
				event: string,
				error: unknown,
				data: Omit<LogEvent, 'level' | 'event' | 'error'> = {},
			): void {
				emit({
					level: 'error',
					event,
					error: formatError(error),
					...base,
					...data,
				})
			},
		}
	},
}

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
	return parts[parts.length - 1] ?? absolutePath
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

export type AppErrorOptions = {
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

export function handleError(error: Error, context: Context) {
	const requestId = context.get('requestId') as string | undefined

	if (error instanceof AppError) {
		log.fromContext(context).warn(error.code, {
			...error.context,
			cause: error.cause ? formatError(error.cause) : undefined,
		})
		return context.json(error.toJSON(), error.status)
	}

	if (error instanceof HTTPException) {
		log.fromContext(context).warn('http_exception', {
			status: error.status,
			cause: error.cause ? formatError(error.cause) : undefined,
		})
		return error.getResponse()
	}

	const doMeta = extractDurableObjectErrorMeta(error)
	log.fromContext(context).error('unhandled_error', error, doMeta)
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
		`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
	).test(origin)
}
