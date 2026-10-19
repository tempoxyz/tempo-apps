import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Structured logger for Cloudflare Workers Logs.
 *
 * Each call passes two args to console.*:
 *   1. the event name as a plain string — Workers Logs displays this inline
 *      in the timeline summary, so logs are scannable without expanding each
 *      row.
 *   2. an object with the structured fields — Workers Logs indexes these as
 *      searchable properties under the log row.
 *
 * Use `event` as a stable machine-friendly key (e.g. `cron.start`,
 * `source.sync`) and put variable values into `props`.
 */
export type LogProps = Record<string, unknown>

export type LogContext = {
	request_id?: string
	run_id?: string
	version?: string
	traffic?: 'synthetic' | 'user'
}
const context = new AsyncLocalStorage<LogContext>()

export function withLogContext<T>(props: LogContext, fn: () => T): T {
	return context.run(props, fn)
}

export function requestTraffic(): 'synthetic' | 'user' {
	return context.getStore()?.traffic ?? 'user'
}

/** Keep credentials and arbitrary URL parameters out of operational logs. */
export function errorFields(error: unknown): LogProps {
	const message = error instanceof Error ? error.message : String(error)
	return {
		error_class: error instanceof Error ? error.name : 'UnknownError',
		error: message
			.replace(/https?:\/\/[^\s]+/g, (value) => {
				try {
					const url = new URL(value)
					return `${url.origin}${url.pathname}`
				} catch {
					return '[url]'
				}
			})
			.replace(/(bearer\s+)[^\s]+/gi, '$1[redacted]')
			.replace(
				/((?:api[_-]?key|token|secret|password|authorization)\s*[=:]\s*)[^\s,;]+/gi,
				'$1[redacted]',
			)
			.slice(0, 1000),
	}
}

function emit(
	level: 'info' | 'warn' | 'error',
	event: string,
	props?: LogProps,
): void {
	const payload = {
		timestamp: new Date().toISOString(),
		level,
		logger: 'mcp-docs-indexer',
		service: 'tempo-docs-mcp',
		env: 'prod',
		...context.getStore(),
		event,
		...props,
		...(props?.error !== undefined
			? { error: errorFields(props.error).error }
			: {}),
	}
	if (level === 'error') console.error(event, payload)
	else if (level === 'warn') console.warn(event, payload)
	else console.info(event, payload)
}

export const log = {
	info: (event: string, props?: LogProps) => emit('info', event, props),
	warn: (event: string, props?: LogProps) => emit('warn', event, props),
	error: (event: string, props?: LogProps) => emit('error', event, props),
}
