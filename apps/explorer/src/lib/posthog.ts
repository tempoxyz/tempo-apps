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
	disable_external_dependency_loading: true,
	// Anonymous events only. Nothing calls identify, so no person profiles.
	person_profiles: 'identified_only',
} as const

/**
 * Inline bootstrap for the PostHog browser SDK.
 * Returns `undefined` when no project key is configured so the page loads
 * nothing PostHog related. Checks the browser hostname at runtime, since a
 * mirror may serve HTML fetched from Tempo, and guards the whole bootstrap so
 * rejected hosts never create a stub or load the SDK.
 */
export function posthogBootScript(options: {
	key: string | undefined
	host: string | undefined
}): string | undefined {
	const { key, host } = options
	if (!key || !host) return undefined
	const config = JSON.stringify({ api_host: host, ...POSTHOG_CONFIG })
	return `if (${POSTHOG_HOST_PATTERN}.test(window.location.hostname)) {
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
(window.requestIdleCallback||function(cb){setTimeout(cb,50)})(function(){posthog.init(${JSON.stringify(key)},${config})});
}`
}
