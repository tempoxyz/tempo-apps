import { createMiddleware } from '@tanstack/react-start'

/**
 * Gets a clean origin URL without basic auth credentials.
 * When accessing via `user:pass@host`, the credentials need to be stripped.
 */
function getCleanOrigin(): string {
	const url = new URL(window.location.href)
	url.username = ''
	url.password = ''
	return url.origin
}

/**
 * Creates a fetch function that strips credentials from URLs.
 * This is needed when accessing the site via basic auth URL (user:pass@host)
 * because browsers reject fetch requests with credentials in the URL.
 */
function createCleanFetch(): typeof fetch {
	return (input, init) => {
		try {
			const cleanOrigin = getCleanOrigin()
			const inputUrl = input instanceof Request ? input.url : String(input)
			const url = new URL(inputUrl, cleanOrigin)

			if (input instanceof Request) {
				return fetch(new Request(url.href, input), init)
			}
			return fetch(url.href, init)
		} catch {
			return fetch(input, init)
		}
	}
}

/**
 * Global middleware that strips basic auth credentials from server function fetch requests.
 * This fixes the "Request cannot be constructed from a URL that includes credentials" error
 * when accessing the site via basic auth URLs like `user:pass@host`.
 */
export const stripCredentialsMiddleware = createMiddleware({ type: 'function' })
	.client(({ next }) => {
		return next({ fetch: createCleanFetch() })
	})
	.server(({ next }) => {
		return next()
	})
