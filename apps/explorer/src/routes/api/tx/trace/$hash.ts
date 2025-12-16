import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import type { Address, Hex } from 'ox'
import type { Client, Transport, Chain } from 'viem'
import { zHash } from '#lib/zod'
import { getConfig } from '#wagmi.config'

export interface CallTrace {
	type: 'CALL' | 'DELEGATECALL' | 'STATICCALL' | 'CREATE' | 'CREATE2'
	from: Address.Address
	to?: Address.Address
	gas: Hex.Hex
	gasUsed: Hex.Hex
	input: Hex.Hex
	output?: Hex.Hex
	value?: Hex.Hex
	error?: string
	revertReason?: string
	calls?: CallTrace[]
}

export interface TraceData {
	trace: CallTrace | null
}

async function traceTransaction(
	client: Client<Transport, Chain>,
	hash: Hex.Hex,
): Promise<CallTrace | null> {
	return client.request({
		method: 'debug_traceTransaction',
		params: [hash, { tracer: 'callTracer' }],
	} as Parameters<typeof client.request>[0])
}

export const Route = createFileRoute('/api/tx/trace/$hash')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const client = getConfig().getClient()
					const hash = zHash().parse(params.hash)
					const trace = await traceTransaction(client, hash).catch(() => null)
					return json<TraceData>({ trace })
				} catch (error) {
					console.error('Trace error:', error)
					return json({ error: 'Failed to fetch trace' }, { status: 500 })
				}
			},
		},
	},
})
