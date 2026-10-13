import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPostHogHost, posthogBootScript } from '#lib/posthog'
import wrangler from '#wrangler.json' with { type: 'json' }

const approvedHosts = Object.values(wrangler.env).flatMap((env) =>
	env.routes.map((route) => route.pattern),
)
const rejectedHosts = [
	'exp.tokclaw.com',
	'explore.tempo.xyz.evil.com',
	'evil-explore.tempo.xyz',
	'tempo.xyz',
	'other.tempo.xyz',
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
		posthog: undefined,
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
	runInNewContext(posthogBootScript, context)
	for (const callback of idleCallbacks) callback()
	return { insertedScripts, idleCallbacks, window }
}

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
	vi.resetModules()
})

describe('PostHog bootstrap host policy', () => {
	it.each(approvedHosts)('loads the SDK on deployed host %s', (hostname) => {
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

	it('initializes with the timer fallback when requestIdleCallback is unavailable', () => {
		expect(bootstrap('explore.tempo.xyz', false).insertedScripts).toHaveLength(
			1,
		)
	})
})

describe('Profiling host policy', () => {
	it.each(
		rejectedHosts,
	)('does not capture or buffer profiling events on %s', async (hostname) => {
		vi.useFakeTimers()
		const capture = vi.fn()
		const window = { location: { hostname }, posthog: { capture } }
		vi.stubGlobal('window', window)
		const { captureEvent } = await import('#lib/profiling')
		captureEvent('explorer.availability.app_boot')
		expect(capture).not.toHaveBeenCalled()
		vi.stubGlobal('window', { location: { hostname } })
		captureEvent('explorer.profiling.ttfb')
		expect(vi.getTimerCount()).toBe(0)
	})

	it('buffers on an approved host and flushes once PostHog is available', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(1000)
		const window: {
			location: { hostname: string }
			posthog?: { capture: ReturnType<typeof vi.fn> }
		} = {
			location: { hostname: 'explore.tempo.xyz' },
		}
		vi.stubGlobal('window', window)
		const { captureEvent } = await import('#lib/profiling')
		captureEvent('explorer.availability.app_boot', { status: 'success' })
		const capture = vi.fn()
		window.posthog = { capture }
		vi.advanceTimersByTime(250)
		expect(capture).toHaveBeenCalledExactlyOnceWith(
			'explorer.availability.app_boot',
			{
				status: 'success',
				timestamp: 1000,
			},
		)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('does not capture or start a timer during SSR', async () => {
		vi.useFakeTimers()
		const { captureEvent } = await import('#lib/profiling')
		captureEvent('explorer.availability.app_boot')
		expect(vi.getTimerCount()).toBe(0)
	})
})
