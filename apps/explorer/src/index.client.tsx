import { StartClient } from '@tanstack/react-start/client'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'

// Patch fetch to strip credentials from URLs (fixes basic auth URL access)
// When accessing via `user:pass@host`, browsers reject fetch URLs with credentials
const originalFetch = window.fetch
window.fetch = function patchedFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	if (typeof input === 'string' && input.startsWith('/')) {
		// Relative URLs are fine, no credentials
		return originalFetch.call(this, input, init)
	}
	try {
		const url = new URL(
			input instanceof Request ? input.url : String(input),
			window.location.origin,
		)
		// Strip username and password from URL
		if (url.username || url.password) {
			url.username = ''
			url.password = ''
			if (input instanceof Request) {
				return originalFetch.call(this, new Request(url.href, input), init)
			}
			return originalFetch.call(this, url.href, init)
		}
	} catch {
		// If URL parsing fails, let original fetch handle it
	}
	return originalFetch.call(this, input, init)
}

hydrateRoot(
	document,
	<React.StrictMode>
		<StartClient />
	</React.StrictMode>,
)
