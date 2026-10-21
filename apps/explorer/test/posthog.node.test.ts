import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { isPostHogHost, posthogBootScript } from '#lib/posthog'
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

function bootstrap(hostname: string, idle = true) {
	const insertedScripts: Array<{ src?: string }> = []
	const idleCallbacks: Array<() => void> = []
	const window = {
		location: { hostname },
		posthog: undefined as undefined | { _i: Array<[string, unknown]> },
		requestIdleCallback: idle
			? (callback: () => void) => idleCallbacks.push(callback)
			: undefined,
	}
	const context = {
		window,
		document: {
			createElement: () => ({}),
			getElementsByTagName: () => [
				{
					parentNode: {
						insertBefore: (script: { src?: string }) =>
							insertedScripts.push(script),
					},
				},
			],
		},
		setTimeout: (callback: () => void) => idleCallbacks.push(callback),
	}
	// In a browser, window.posthog is also the global posthog binding.
	Object.defineProperty(context, 'posthog', { get: () => window.posthog })
	const script = posthogBootScript({ key, host })
	if (!script) throw new Error('expected a boot script')
	runInNewContext(script, context)
	for (const callback of idleCallbacks) callback()
	return { insertedScripts, idleCallbacks, window }
}

describe('PostHog bootstrap', () => {
	it('emits nothing without a key and host', () => {
		expect(posthogBootScript({ key: undefined, host })).toBeUndefined()
		expect(posthogBootScript({ key, host: undefined })).toBeUndefined()
		expect(posthogBootScript({ key: '', host: '' })).toBeUndefined()
	})

	it('initializes with page views only', () => {
		const { window } = bootstrap('explore.tempo.xyz')
		const [initKey, config] = window.posthog?._i[0] ?? []
		expect(initKey).toBe(key)
		expect(config).toEqual({
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

	it('initializes with the timer fallback when requestIdleCallback is unavailable', () => {
		expect(bootstrap('explore.tempo.xyz', false).insertedScripts).toHaveLength(
			1,
		)
	})
})

describe('PostHog bootstrap host policy', () => {
	it.each(
		approvedHosts,
	)('loads the SDK on approved subdomain %s', (hostname) => {
		expect(isPostHogHost(hostname)).toBe(true)
		const { insertedScripts, idleCallbacks, window } = bootstrap(hostname)
		expect(idleCallbacks).toHaveLength(1)
		expect(window.posthog).toBeDefined()
		expect(insertedScripts).toEqual([
			{
				type: 'text/javascript',
				crossOrigin: 'anonymous',
				async: true,
				src: 'https://us-assets.i.posthog.com/static/array.js',
			},
		])
	})

	it.each(
		rejectedHosts,
	)('does not initialize or load the SDK on %s', (hostname) => {
		expect(isPostHogHost(hostname)).toBe(false)
		const { insertedScripts, idleCallbacks, window } = bootstrap(hostname)
		expect(insertedScripts).toEqual([])
		expect(idleCallbacks).toEqual([])
		expect(window.posthog).toBeUndefined()
	})
})
