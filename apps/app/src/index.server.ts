import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry({
	fetch: async (request, opts) => {
		return handler.fetch(request, opts)
	},
})
