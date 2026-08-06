import { queryOptions } from '@tanstack/react-query'
import type { Address, Hex } from 'ox'
import {
	formatLog,
	parseEventLogs,
	toEventSelector,
	zeroAddress,
	zeroHash,
} from 'viem'
import type { Log, RpcLog, TransactionReceipt } from 'viem'
import { getApiUrl } from '#lib/env'
import type { CallTrace, PrestateDiff } from '#lib/queries/trace'
import type {
	SerializedExecutionResult,
	SerializedSimulationResult,
} from '#routes/api/simulate'

export interface SimulationBatchCall {
	to: Address.Address
	data: Hex.Hex
	value: string
}

export interface SimulationInput {
	chainId: 4217 | 42431 | 31318
	from: Address.Address
	to: Address.Address
	data: Hex.Hex
	value: string
	gas: string
	block: 'latest' | Hex.Hex
	/** Tempo batch calls, executed in order against each other's state. */
	calls?: SimulationBatchCall[] | undefined
}

export interface SimulationCallResult {
	index: number
	to: Address.Address
	data: Hex.Hex
	value: string
	status: 'success' | 'reverted'
	gasUsed: bigint
	returnData: Hex.Hex
	revertData?: Hex.Hex | undefined
	logs: Log[]
}

export interface SimulationAssetChange {
	address: Address.Address
	token: Address.Address
	diff: bigint
}

export interface SimulationResult {
	trace: CallTrace | null
	prestate: PrestateDiff | null
	status: 'success' | 'reverted'
	gasUsed: bigint
	returnData: Hex.Hex
	logs: Log[]
	receipt: TransactionReceipt
	assetChanges: SimulationAssetChange[]
	blockHash: Hex.Hex
	blockNumber: bigint
	errors: {
		callTracer?: string | undefined
		prestate?: string | undefined
		simulate?: string | undefined
	}
}

export interface SimulationExecutionResult {
	status: 'success' | 'reverted'
	gasUsed: bigint
	returnData: Hex.Hex
	logs: Log[]
	receipt: TransactionReceipt
	assetChanges: SimulationAssetChange[]
	blockHash: Hex.Hex
	blockNumber: bigint
	/** One entry per call; length 1 for an ordinary single call. */
	calls: SimulationCallResult[]
}

export class SimulationApiError extends Error {
	status: number

	constructor(message: string, status: number) {
		super(message)
		this.name = 'SimulationApiError'
		this.status = status
	}
}

async function postSimulation<T>(
	input: SimulationInput,
	panel?: 'trace' | 'prestate' | 'execution',
): Promise<T> {
	const response = await fetch(getApiUrl('/api/simulate'), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...input, panel }),
	})

	// Not every failure is JSON — the rate limiter replies with plain text, and
	// parsing it blindly turned a 429 into a SyntaxError.
	const text = await response.text()
	let payload: (T & { error?: string }) | undefined
	try {
		payload = JSON.parse(text) as T & { error?: string }
	} catch {
		payload = undefined
	}

	if (!response.ok)
		throw new SimulationApiError(
			payload?.error ?? text.trim() ?? 'Simulation request failed',
			response.status,
		)
	if (!payload)
		throw new SimulationApiError(
			'Simulation returned a malformed response',
			response.status,
		)
	return payload
}

const transferTopic = toEventSelector(
	'event Transfer(address indexed from, address indexed to, uint256 amount)',
)

function buildAssetChanges(logs: Log[]): SimulationAssetChange[] {
	const changes = new Map<string, SimulationAssetChange>()
	const events = parseEventLogs({
		abi: [
			{
				type: 'event',
				name: 'Transfer',
				inputs: [
					{ indexed: true, name: 'from', type: 'address' },
					{ indexed: true, name: 'to', type: 'address' },
					{ indexed: false, name: 'amount', type: 'uint256' },
				],
			},
		] as const,
		logs: logs.filter((log) => log.topics[0] === transferTopic),
		strict: false,
	})

	function add(address: Address.Address, token: Address.Address, diff: bigint) {
		if (address.toLowerCase() === zeroAddress) return
		const key = `${address.toLowerCase()}:${token.toLowerCase()}`
		const current = changes.get(key)
		if (current) current.diff += diff
		else changes.set(key, { address, token, diff })
	}

	for (const event of events) {
		const { from, to, amount } = event.args
		if (amount === undefined) continue
		if (from) add(from, event.address, -amount)
		if (to) add(to, event.address, amount)
	}
	return [...changes.values()].filter((change) => change.diff !== 0n)
}

function normalizeExecution(
	input: SimulationInput,
	execution: SerializedExecutionResult | null,
	trace: CallTrace | null,
): SimulationExecutionResult {
	const status =
		execution?.status ??
		(trace?.error || trace?.revertReason ? 'reverted' : 'success')
	const gasUsed = BigInt(execution?.gasUsed ?? trace?.gasUsed ?? '0x0')
	const returnData = execution?.returnData ?? trace?.output ?? '0x'
	const logs = (execution?.logs ?? []).map((log) =>
		formatLog(log as RpcLog),
	) as Log[]
	const blockHash = execution?.blockHash ?? zeroHash
	const blockNumber = BigInt(execution?.blockNumber ?? '0x0')

	const batch = input.calls?.length ? input.calls : undefined
	const calls: SimulationCallResult[] = (execution?.calls ?? []).map(
		(call, index) => ({
			index,
			to: batch?.[index]?.to ?? input.to,
			data: batch?.[index]?.data ?? input.data,
			value: batch?.[index]?.value ?? input.value,
			status: call.status,
			gasUsed: BigInt(call.gasUsed),
			returnData: call.returnData,
			revertData: call.revertData,
			logs: (call.logs ?? []).map((log) => formatLog(log as RpcLog)) as Log[],
		}),
	)
	const receipt: TransactionReceipt = {
		blockHash,
		blockNumber,
		contractAddress: null,
		cumulativeGasUsed: gasUsed,
		effectiveGasPrice: 0n,
		from: input.from,
		gasUsed,
		logs: logs as unknown as TransactionReceipt['logs'],
		logsBloom: `0x${'0'.repeat(512)}`,
		status,
		to: input.to,
		transactionHash: logs[0]?.transactionHash ?? zeroHash,
		transactionIndex: 0,
		type: 'eip1559',
	}
	return {
		status,
		gasUsed,
		returnData,
		logs,
		receipt,
		assetChanges: buildAssetChanges(logs),
		blockHash,
		blockNumber,
		calls,
	}
}

export function normalizeSimulationResult(
	input: SimulationInput,
	wire: SerializedSimulationResult,
): SimulationResult {
	const trace = wire.trace as CallTrace | null
	const execution = normalizeExecution(input, wire.execution, trace)
	return {
		trace,
		prestate: wire.prestate as PrestateDiff | null,
		...execution,
		errors: wire.errors,
	}
}

export function simulationQueryKey(input: SimulationInput) {
	return [
		'simulation',
		input.chainId,
		input.block,
		input.from,
		input.to,
		input.data,
		input.value,
		input.gas,
		input.calls?.map((call) => `${call.to}:${call.data}:${call.value}`) ?? null,
	] as const
}

export function simulateQueryOptions(input: SimulationInput) {
	return queryOptions({
		queryKey: simulationQueryKey(input),
		queryFn: async () =>
			normalizeSimulationResult(
				input,
				await postSimulation<SerializedSimulationResult>(input),
			),
		staleTime: input.block === 'latest' ? 0 : Number.POSITIVE_INFINITY,
	})
}

export function simulationTraceQueryOptions(input: SimulationInput) {
	return queryOptions({
		queryKey: [...simulationQueryKey(input), 'trace'],
		queryFn: async () => {
			const result = await postSimulation<{ trace: CallTrace[] }>(
				input,
				'trace',
			)
			return result.trace ?? []
		},
		staleTime: input.block === 'latest' ? 0 : Number.POSITIVE_INFINITY,
	})
}

export function simulationPrestateQueryOptions(input: SimulationInput) {
	return queryOptions({
		queryKey: [...simulationQueryKey(input), 'prestate'],
		queryFn: async () => {
			const result = await postSimulation<{ prestate: PrestateDiff[] }>(
				input,
				'prestate',
			)
			return result.prestate ?? []
		},
		staleTime: input.block === 'latest' ? 0 : Number.POSITIVE_INFINITY,
	})
}

/**
 * Collapse per-call diffs into one. Earliest `pre` and latest `post` win, so
 * the merged view reads as the net effect of the whole batch.
 */
export function mergePrestateDiffs(
	diffs: readonly PrestateDiff[],
): PrestateDiff | null {
	if (diffs.length === 0) return null
	if (diffs.length === 1) return diffs[0] ?? null

	const merged: PrestateDiff = { pre: {}, post: {} }
	for (const diff of diffs) {
		for (const [address, state] of Object.entries(diff.pre ?? {})) {
			const key = address as Address.Address
			const existing = merged.pre[key]
			merged.pre[key] = existing
				? {
						...state,
						...existing,
						storage: { ...state.storage, ...existing.storage },
					}
				: state
		}
		for (const [address, state] of Object.entries(diff.post ?? {})) {
			const key = address as Address.Address
			const existing = merged.post[key]
			merged.post[key] = existing
				? {
						...existing,
						...state,
						storage: { ...existing.storage, ...state.storage },
					}
				: state
		}
	}

	// `diffMode` only reports fields that changed, so after merging an account
	// can carry a nonce on one side and not the other. Left alone that renders
	// as "nonce 1 → 0" — a change that never happened.
	for (const address of new Set([
		...Object.keys(merged.pre),
		...Object.keys(merged.post),
	])) {
		const key = address as Address.Address
		const pre = merged.pre[key]
		const post = merged.post[key]
		if (!pre || !post) continue
		if (pre.nonce !== undefined && post.nonce === undefined)
			merged.post[key] = { ...post, nonce: pre.nonce }
		else if (post.nonce !== undefined && pre.nonce === undefined)
			merged.pre[key] = { ...pre, nonce: post.nonce }
	}

	return merged
}

export function simulationExecutionQueryOptions(input: SimulationInput) {
	return queryOptions({
		queryKey: [...simulationQueryKey(input), 'execution'],
		queryFn: async () => {
			const result = await postSimulation<{
				execution: SerializedExecutionResult
			}>(input, 'execution')
			return normalizeExecution(input, result.execution, null)
		},
		staleTime: input.block === 'latest' ? 0 : Number.POSITIVE_INFINITY,
	})
}
