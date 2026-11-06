import { describe, expect, it } from 'vitest'
import { getPostHogInit, isPostHogHost } from '#lib/posthog'
import wrangler from '#wrangler.json' with { type: 'json' }

const key = 'phc_test'
const host = 'https://us.i.posthog.com'

const approvedHosts = [
	...Object.values(wrangler.env).flatMap((env) =>
		env.routes.map((route) => route.pattern),
	),
	'explore.tempoxyz.dev',
	'preview.explore.tempoxyz.dev',
	'branch.preview.explore.tempoxyz.dev',
	'other.tempo.xyz',
	'branch.preview.explore.tempo.xyz',
	'evil-explore.tempo.xyz',
]
const rejectedHosts = [
	'exp.tokclaw.com',
	'explore.tempo.xyz.evil.com',
	'explore.tempoxyz.dev.evil.com',
	'eviltempo.xyz',
	'eviltempoxyz.dev',
	'tempo.xyz',
	'tempoxyz.dev',
	'explorer-mainnet.example.workers.dev',
	'localhost',
	'127.0.0.1',
	'',
]

describe('PostHog init', () => {
	it('initializes nothing without a key and host', () => {
		const hostname = 'explore.tempo.xyz'
		expect(getPostHogInit({ key: undefined, host, hostname })).toBeUndefined()
		expect(getPostHogInit({ key, host: undefined, hostname })).toBeUndefined()
		expect(getPostHogInit({ key: '', host: '', hostname })).toBeUndefined()
	})

	it('initializes with page views only and no remote SDK loading', () => {
		const init = getPostHogInit({ key, host, hostname: 'explore.tempo.xyz' })
		expect(init?.key).toBe(key)
		expect(init?.config).toEqual({
			api_host: host,
			defaults: '2025-11-30',
			capture_pageview: 'history_change',
			capture_pageleave: false,
			autocapture: false,
			capture_dead_clicks: false,
			capture_exceptions: false,
			capture_heatmaps: false,
			capture_performance: false,
			rageclick: false,
			disable_session_recording: true,
			disable_surveys: true,
			disable_web_experiments: true,
			advanced_disable_flags: true,
			disable_external_dependency_loading: true,
			person_profiles: 'identified_only',
		})
	})
})

describe('PostHog host policy', () => {
	it.each(approvedHosts)('initializes on approved subdomain %s', (hostname) => {
		expect(isPostHogHost(hostname)).toBe(true)
		expect(getPostHogInit({ key, host, hostname })).toBeDefined()
	})

	it.each(rejectedHosts)('does not initialize on %s', (hostname) => {
		expect(isPostHogHost(hostname)).toBe(false)
		expect(getPostHogInit({ key, host, hostname })).toBeUndefined()
	})
})
