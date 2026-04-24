import {
	dispose,
	configure,
	getLogger,
	withContext,
	getConsoleSink,
	type LogRecord,
} from '@logtape/logtape'
import { prettyFormatter } from '@logtape/pretty'
import { AsyncLocalStorage } from 'node:async_hooks'
import { getLogger as getDrizzleLogger } from '@logtape/drizzle-orm'

export { dispose, getLogger, withContext }

const contextLocalStorage = new AsyncLocalStorage<Record<string, unknown>>()

const APP_CATEGORY = 'tempo'

/**
 * Custom JSON sink that outputs structured JSON matching the previous logging format.
 * Each log line is a single JSON object with `event` as the message string
 * and all properties spread at the top level.
 */
function jsonSink(record: LogRecord): void {
	const event = record.message
		.map((v) => (typeof v === 'string' ? v : String(v)))
		.join('')
	const timestamp = new Date(record.timestamp as string | number).toISOString()
	const payload = JSON.stringify({
		timestamp,
		level: record.level,
		logger: record.category.join('.'),
		event,
		...record.properties,
	})

	switch (record.level) {
		case 'info': {
			console.info(payload)
			break
		}
		case 'warning': {
			console.warn(payload)
			break
		}
		case 'error':
		case 'fatal': {
			console.error(payload)
			break
		}
		case 'debug': {
			console.debug(payload)
			break
		}
	}
}

export async function configureLogger(
	nodeEnv?: string,
	isDebugEnabled?: boolean,
): Promise<void> {
	const debugEnabled = isDebugEnabled ?? process.env.VITE_LOG_LEVEL === 'debug'

	const sinkName =
		(nodeEnv ?? process.env.NODE_ENV) === 'production' ? 'json' : 'pretty'

	await configure({
		reset: true,
		contextLocalStorage,
		sinks: {
			json: jsonSink,
			pretty: getConsoleSink({ formatter: prettyFormatter }),
			meta: getConsoleSink(),
		},
		loggers: [
			{
				category: [APP_CATEGORY],
				lowestLevel: debugEnabled ? 'debug' : 'info',
				sinks: [sinkName],
			},
			{
				category: [APP_CATEGORY, 'db'],
				lowestLevel: debugEnabled ? 'debug' : 'warning',
				sinks: [sinkName],
				parentSinks: 'override',
			},
			{
				category: ['logtape', 'meta'],
				lowestLevel: 'warning',
				sinks: ['meta'],
			},
		],
	})
}

export function getDatabaseLogger() {
	return getDrizzleLogger({
		category: [APP_CATEGORY, 'db'],
		level: 'debug',
	})
}
