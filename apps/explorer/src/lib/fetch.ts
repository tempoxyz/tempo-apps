/**
 * Client-safe fetch that strips basic auth credentials from URLs.
 *
 * When accessing the site via basic auth URL (user:pass@host), browsers reject
 * fetch requests where the URL includes credentials. This utility ensures URLs
 * are resolved against a clean origin without credentials.
 */
export function safeFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	// On server, just use regular fetch
	if (typeof window === 'undefined') {
		return fetch(input, init)
	}

	try {
		// Get a clean origin (strip credentials from current location)
		const cleanOrigin = new URL(window.location.href)
		cleanOrigin.username = ''
		cleanOrigin.password = ''

		// Resolve URL against clean origin
		const inputUrl = input instanceof Request ? input.url : String(input)
		const url = new URL(inputUrl, cleanOrigin.origin)

		// Make the request with the clean URL
		if (input instanceof Request) {
			return fetch(new Request(url.href, input), init)
		}
		return fetch(url.href, init)
	} catch {
		// If URL parsing fails, let the original fetch handle it
		return fetch(input, init)
	}
}
