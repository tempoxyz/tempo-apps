import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import type { Address, Hex } from 'ox'
import type { Chain, Client, Transport } from 'viem'
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

export interface AccountState {
	balance?: Hex.Hex
	nonce?: number
	code?: Hex.Hex
	storage?: Record<Hex.Hex, Hex.Hex>
}

export interface PrestateDiff {
	pre: Record<Address.Address, AccountState>
	post: Record<Address.Address, AccountState>
}

export interface TraceData {
	trace: CallTrace | null
	prestate: PrestateDiff | null
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

async function tracePrestate(
	client: Client<Transport, Chain>,
	hash: Hex.Hex,
): Promise<PrestateDiff | null> {
	return client.request({
		method: 'debug_traceTransaction',
		params: [
			hash,
			{ tracer: 'prestateTracer', tracerConfig: { diffMode: true } },
		],
	} as Parameters<typeof client.request>[0])
}

export const Route = createFileRoute('/api/tx/trace/$hash')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const client = getConfig().getClient()
					const hash = zHash().parse(params.hash)
					const [trace, prestate] = await Promise.all([
						traceTransaction(client, hash).catch(() => null),
						tracePrestate(client, hash).catch(() => null),
					])
					return json<TraceData>({ trace, prestate })
				} catch (error) {
					console.error('Trace error:', error)
					return json({ error: 'Failed to fetch trace' }, { status: 500 })
				}
			},
		},
	},
})
