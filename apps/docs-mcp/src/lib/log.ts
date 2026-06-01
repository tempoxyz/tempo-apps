/**
 * Structured JSON logger. Each call emits a single JSON line that lands in
 * Cloudflare Workers Logs (observability.logs in wrangler.jsonc). Matches the
 * shape used in other apps in this repo (see contract-verification/src/lib/logger.ts).
 *
 * Use `event` as a stable machine-friendly key (e.g. `cron.start`, `source.sync`)
 * and put variable values into `props`.
 */
export type LogProps = Record<string, unknown>

function emit(
	level: 'info' | 'warn' | 'error',
	event: string,
	props?: LogProps,
): void {
	const line = JSON.stringify({
		timestamp: new Date().toISOString(),
		level,
		logger: 'docs-mcp',
		event,
		...props,
	})
	if (level === 'error') console.error(line)
	else if (level === 'warn') console.warn(line)
	else console.info(line)
}

export const log = {
	info: (event: string, props?: LogProps) => emit('info', event, props),
	warn: (event: string, props?: LogProps) => emit('warn', event, props),
	error: (event: string, props?: LogProps) => emit('error', event, props),
}
