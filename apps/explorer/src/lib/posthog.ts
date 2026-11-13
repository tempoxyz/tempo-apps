import type { PostHogConfig } from 'posthog-js'

// Allow any depth of subdomain under Tempo's domains, including internal previews.
// The leading dot prevents lookalike domains from matching.
const POSTHOG_HOST_PATTERN = /\.(?:tempoxyz\.dev|tempo\.xyz)$/

export function isPostHogHost(hostname: string): boolean {
	return POSTHOG_HOST_PATTERN.test(hostname)
}

// Page views only. Everything else PostHog can collect is switched off here,
// and no code in this app calls `posthog.capture` or `posthog.identify`.
const POSTHOG_CONFIG = {
	defaults: '2025-11-30',
	// Initial load plus SPA navigations.
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
	// The SDK is bundled from npm; never load array.js or extensions from
	// PostHog's CDN, which can't be pinned with Subresource Integrity.
	disable_external_dependency_loading: true,
	// Anonymous events only. Nothing calls identify, so no person profiles.
	person_profiles: 'identified_only',
} as const satisfies Partial<PostHogConfig>

/**
 * Config passed to `posthog.init`, or `undefined` when no project key or host
 * is configured or the page is not served from a Tempo host (a mirror may
 * serve HTML fetched from Tempo).
 */
export function getPostHogInit(options: {
	key: string | undefined
	host: string | undefined
	hostname: string
}): { key: string; config: Partial<PostHogConfig> } | undefined {
	const { key, host, hostname } = options
	if (!key || !host) return undefined
	if (!isPostHogHost(hostname)) return undefined
	return { key, config: { api_host: host, ...POSTHOG_CONFIG } }
}

/**
 * Starts PostHog page views in the browser. Deferred to idle time and loaded
 * as a separate bundled chunk, so it never blocks the initial render and
 * rejected hosts never download the SDK.
 */
export function initPostHog(options: {
	key: string | undefined
	host: string | undefined
}): void {
	if (typeof window === 'undefined') return
	const init = getPostHogInit({
		...options,
		hostname: window.location.hostname,
	})
	if (!init) return
	const schedule =
		window.requestIdleCallback ??
		((callback: () => void) => setTimeout(callback, 50))
	schedule(() => {
		void import('posthog-js').then(({ default: posthog }) => {
			posthog.init(init.key, init.config)
		})
	})
}
