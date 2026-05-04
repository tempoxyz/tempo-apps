import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildEnvSchema } from '../src/lib/build-env'
import { serverEnvSchema } from '../src/lib/server/env'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Client and CF-binding env vars that aren't covered by a schema importable
 * from a pure Node context. These change rarely — the schemas are the
 * primary source of truth for everything else.
 */
const CLIENT_AND_BINDING_VARS = [
	'SENTRY_DSN',
	'SENTRY_TRACES_SAMPLE_RATE',
	'VITE_CONTRACT_VERIFICATION_API_BASE_URL',
	'VITE_SENTRY_DSN',
	'VITE_SENTRY_TRACES_SAMPLE_RATE',
	'VITE_TEMPO_ENV',
] as const

function schemaKeys(schema: { shape: Record<string, unknown> }): string[] {
	return Object.keys(schema.shape)
}

const ALL_VARS = new Set([
	...schemaKeys(buildEnvSchema),
	...schemaKeys(serverEnvSchema),
	...CLIENT_AND_BINDING_VARS,
])

function parseEnvExample(): Set<string> {
	const content = readFileSync(resolve(__dirname, '../.env.example'), 'utf-8')
	const vars = new Set<string>()
	for (const line of content.split('\n')) {
		const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/)
		if (match) vars.add(match[1])
	}
	return vars
}

describe('env sync', () => {
	it('.env.example contains all canonical env vars', () => {
		const envExample = parseEnvExample()
		const missing = [...ALL_VARS].filter((v) => !envExample.has(v))
		expect(missing, `Missing from .env.example: ${missing.join(', ')}`).toEqual(
			[],
		)
	})

	it('.env.example has no unknown env vars', () => {
		const envExample = parseEnvExample()
		const unknown = [...envExample].filter((v) => !ALL_VARS.has(v))
		expect(
			unknown,
			`Unknown vars in .env.example: ${unknown.join(', ')}`,
		).toEqual([])
	})
})
