import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

// Preview ingress supplies private access; Cloudflare bindings are not required.
export default createServerEntry({
	fetch: (request, options) => handler.fetch(request, options),
})
