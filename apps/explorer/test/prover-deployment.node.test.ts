import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import config from '../wrangler.json' with { type: 'json' }
import { inferTempoEnvFromHostname } from '#lib/env'
import { tempoZoneProver } from '#lib/chains'

describe('internal prover deployment', () => {
	it('disables all Cloudflare public entrypoints', () => {
		const environment = config.env['zone-prover']
		expect(environment.routes).toEqual([])
		expect(environment.workers_dev).toBe(false)
		expect(environment.preview_urls).toBe(false)
		expect(environment.vars.VITE_DATADOG_ENABLED).toBe('false')
		expect(environment.vars.VITE_SENTRY_DSN).toBe('')
		for (const workflow of ['main', 'pull-request'])
			expect(
				readFileSync(`../../.github/workflows/${workflow}.yml`, 'utf8'),
			).not.toContain('zone-prover')
	})
	it('rejects public deployment before invoking Wrangler', () => {
		const result = spawnSync(
			'bash',
			['scripts/deploy.sh', '--env', 'zone-prover'],
			{ encoding: 'utf8' },
		)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('internal-only')
	})
	it('identifies the tailnet host and advertises only its read-only RPC relay', () => {
		expect(
			inferTempoEnvFromHostname(
				'dev-eu-zone-prover-explorer.tail388b2e.ts.net',
			),
		).toBe('zone-prover')
		expect(tempoZoneProver.id).toBe(31318)
		expect(tempoZoneProver.rpcUrls.default.http).toEqual([
			'https://dev-eu-zone-prover-explorer.tail388b2e.ts.net/api/rpc',
		])
	})
})
