import { StartClient } from '@tanstack/react-start/client'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'

// Patch fetch to strip credentials from URLs (fixes basic auth URL access)
// When accessing via `user:pass@host`, browsers reject fetch URLs with credentials
const originalFetch = window.fetch

// Get a clean origin without credentials
function getCleanOrigin(): string {
	const url = new URL(window.location.href)
	url.username = ''
	url.password = ''
	return url.origin
}

window.fetch = function patchedFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	try {
		// Resolve the URL using clean origin (without credentials)
		const cleanOrigin = getCleanOrigin()
		const inputUrl = input instanceof Request ? input.url : String(input)
		const url = new URL(inputUrl, cleanOrigin)

		// Always use the clean URL (credentials stripped)
		if (input instanceof Request) {
			return originalFetch.call(this, new Request(url.href, input), init)
		}
		return originalFetch.call(this, url.href, init)
	} catch {
		// If URL parsing fails, let original fetch handle it
		return originalFetch.call(this, input, init)
	}
}

hydrateRoot(
	document,
	<React.StrictMode>
		<StartClient />
	</React.StrictMode>,
)
