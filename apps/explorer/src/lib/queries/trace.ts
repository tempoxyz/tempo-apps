import type { Address, Hex } from 'ox'
import type { Chain, Client, Transport } from 'viem'

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

export async function traceTransaction(
	client: Client<Transport, Chain>,
	hash: Hex.Hex,
): Promise<CallTrace | null> {
	return client.request({
		method: 'debug_traceTransaction',
		params: [hash, { tracer: 'callTracer' }],
	} as Parameters<typeof client.request>[0])
}
