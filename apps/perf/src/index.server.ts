import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

const serverEntry = createServerEntry({
	fetch: (request, opts) => handler.fetch(request, opts),
})

export default {
	fetch: (request: Request) => serverEntry.fetch(request, undefined),
}
