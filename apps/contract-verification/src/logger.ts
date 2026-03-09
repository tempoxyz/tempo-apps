import { prettyFormatter } from '@logtape/pretty'
import { getLogger as getDrizzleLogger } from '@logtape/drizzle-orm'
import { configure, getConsoleSink, getLogger, type LogRecord } from '@logtape/logtape'

const APP_CATEGORY = 'tempo'

/**
 * Custom JSON sink that outputs structured JSON matching the previous logging format.
 * Each log line is a single JSON object with `event` as the message string
 * and all properties spread at the top level.
 */
function jsonSink(record: LogRecord): void {
  const event = record.message.map(v => (typeof v === 'string' ? v : String(v))).join('')
  const payload = JSON.stringify({ event, ...record.properties })

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

export async function configureLogger(nodeEnv?: string, isDebugEnabled?: boolean): Promise<void> {
  const debugEnabled =
    isDebugEnabled ?? (process.env.LOG_DEBUG === '1' || process.env.LOG_DEBUG === 'true')
  const sinkName = (nodeEnv ?? process.env.NODE_ENV) === 'production' ? 'json' : 'pretty'

  await configure({
    reset: true,
    sinks: {
      json: jsonSink,
      pretty: getConsoleSink({ formatter: prettyFormatter })
    },
    loggers: [
      { category: [APP_CATEGORY], lowestLevel: 'info', sinks: [sinkName] },
      {
        category: [APP_CATEGORY, 'db'],
        lowestLevel: debugEnabled ? 'debug' : 'warning',
        sinks: [sinkName]
      },
      {
        category: ['logtape', 'meta'],
        lowestLevel: 'warning',
        sinks: [sinkName]
      }
    ]
  })
}

export function getAppLogger() {
  return getLogger([APP_CATEGORY, 'worker'])
}

export function getContainerLogger() {
  return getLogger([APP_CATEGORY, 'container'])
}

export function getDatabaseLogger() {
  return getDrizzleLogger({
    category: [APP_CATEGORY, 'db'],
    level: 'debug'
  })
}
