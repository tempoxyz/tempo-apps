import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'

export default {
	fetch: handler.fetch,
} satisfies ServerEntry
