import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
	fetchTraceData,
	type TraceData,
} from '#lib/queries/trace'
import { zHash } from '#lib/zod'

export type {
	AccountState,
	CallTrace,
	PrestateDiff,
	TraceData,
} from '#lib/queries/trace'

export const Route = createFileRoute('/api/tx/trace/$hash')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const hash = zHash().parse(params.hash)
					const traceData = await fetchTraceData(hash)
					return json<TraceData>(traceData)
				} catch (error) {
					console.error('Trace error:', error)
					return json({ error: 'Failed to fetch trace' }, { status: 500 })
				}
			},
		},
	},
})
