import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import config from '../wrangler.json' with { type: 'json' }
import { inferTempoEnvFromHostname } from '#lib/env'
import { tempoZoneProver } from '#lib/chains'

describe('employee-only prover deployment', () => {
	it('serves only the Access-protected hostname without alternate URLs', () => {
		const environment = config.env['zone-prover']
		expect(environment.routes).toEqual([
			{
				custom_domain: true,
				zone_name: 'tehq.net',
				pattern: 'explore-zone-prover.tehq.net',
			},
		])
		expect(environment.workers_dev).toBe(false)
		expect(environment.preview_urls).toBe(false)
		expect(environment.vars.VITE_DATADOG_ENABLED).toBe('false')
		expect(environment.vars.VITE_SENTRY_DSN).toBe('')
		for (const workflow of ['main', 'pull-request'])
			expect(
				readFileSync(`../../.github/workflows/${workflow}.yml`, 'utf8'),
			).not.toContain('zone-prover')
	})
	it('requires Access readiness acknowledgment before invoking Wrangler', () => {
		const result = spawnSync(
			'bash',
			['scripts/deploy.sh', '--env', 'zone-prover'],
			{ encoding: 'utf8', env: { ...process.env, PROVER_ACCESS_READY: '' } },
		)
		expect(result.status).toBe(1)
		expect(result.stderr).toContain(
			'Apply the prover Cloudflare Access policy first',
		)
	})
	it('identifies the protected host and advertises only its read-only RPC relay', () => {
		expect(inferTempoEnvFromHostname('explore-zone-prover.tehq.net')).toBe(
			'zone-prover',
		)
		expect(tempoZoneProver.id).toBe(31318)
		expect(tempoZoneProver.rpcUrls.default.http).toEqual([
			'https://explore-zone-prover.tehq.net/api/rpc',
		])
	})
})
