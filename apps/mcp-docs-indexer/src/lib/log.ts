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

function emit(
	level: 'info' | 'warn' | 'error',
	event: string,
	props?: LogProps,
): void {
	const payload = {
		timestamp: new Date().toISOString(),
		level,
		logger: 'mcp-docs-indexer',
		event,
		...props,
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
