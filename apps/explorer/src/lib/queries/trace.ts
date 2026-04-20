import { queryOptions } from '@tanstack/react-query'
import type { Address, Hex } from 'ox'
import { zeroAddress } from 'viem'
import { getWagmiConfig } from '#wagmi.config.ts'

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

export async function fetchTraceData(hash: Hex.Hex): Promise<TraceData> {
	const config = getWagmiConfig()
	const client = config.getClient()

	// TODO: investigate & consider batch/multicall
	const [trace, prestate] = await Promise.all([
		(
			client.request({
				method: 'debug_traceTransaction',
				params: [hash, { tracer: 'callTracer' }],
			} as Parameters<typeof client.request>[0]) as Promise<CallTrace>
		).catch(() => null),
		(
			client.request({
				method: 'debug_traceTransaction',
				params: [
					hash,
					{ tracer: 'prestateTracer', tracerConfig: { diffMode: true } },
				],
			} as Parameters<typeof client.request>[0]) as Promise<PrestateDiff>
		).catch(() => null),
	])
	// Tempo's callTracer wraps the real execution in a system-level CALL to the
	// zero address. Unwrap it so the trace tree starts at the actual transaction.
	const unwrapped =
		trace?.to === zeroAddress && trace.calls?.length === 1
			? trace.calls[0]
			: trace

	return { trace: unwrapped ?? null, prestate }
}

export function traceQueryOptions(params: { hash: string }) {
	return queryOptions({
		queryKey: ['trace', params.hash],
		queryFn: () => fetchTraceData(params.hash as Hex.Hex),
		staleTime: Infinity,
	})
}
