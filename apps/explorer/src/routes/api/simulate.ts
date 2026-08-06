import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import type { Hex } from 'ox'
import * as OxHex from 'ox/Hex'
import { numberToHex } from 'viem'
import * as z from 'zod/mini'
import { tempoMainnet, tempoTestnet } from '#lib/chains'
import { serverEnv, tempoApiUrl } from '#lib/server/env'
import { checkRateLimit } from '#lib/server/rate-limit'
import { zAddress, zHash } from '#lib/zod'

export const MAX_SIMULATION_CALLDATA_BYTES = 64 * 1024
const MAX_REQUEST_BYTES = MAX_SIMULATION_CALLDATA_BYTES * 2 + 16 * 1024
const SIMULATION_TIMEOUT_MS = 15_000

const DecimalSchema = z.string().check(z.regex(/^\d+$/))

const CalldataSchema = z.pipe(
	z.string().check((ctx) => {
		if (!OxHex.validate(ctx.value)) {
			ctx.issues.push({
				code: 'custom',
				input: ctx.value,
				message: 'Invalid calldata',
			})
			return
		}
		if (OxHex.size(ctx.value) > MAX_SIMULATION_CALLDATA_BYTES)
			ctx.issues.push({
				code: 'custom',
				input: ctx.value,
				message: `Calldata exceeds ${MAX_SIMULATION_CALLDATA_BYTES.toLocaleString()} bytes`,
			})
	}),
	z.transform((value) => value as Hex.Hex),
)

const BlockSchema = z.union([z.literal('latest'), zHash()])

const BatchCallSchema = z.object({
	to: zAddress({ lowercase: true }),
	data: CalldataSchema,
	value: z.prefault(DecimalSchema, '0'),
})

export const MAX_BATCH_CALLS = 32

export const SimulationRequestSchema = z.object({
	chainId: z.union([z.literal(4217), z.literal(42431), z.literal(31318)]),
	from: zAddress({ lowercase: true }),
	to: zAddress({ lowercase: true }),
	data: CalldataSchema,
	value: z.prefault(DecimalSchema, '0'),
	gas: DecimalSchema,
	block: z.prefault(BlockSchema, 'latest'),
	panel: z.optional(z.enum(['trace', 'prestate', 'execution'])),
	/**
	 * Tempo batch transactions carry N calls that execute in order against each
	 * other's state. Simulating them one at a time is not merely partial, it is
	 * wrong — call 2 of an approve→deposit pair reverts without call 1.
	 */
	calls: z.optional(
		z.array(BatchCallSchema).check(z.maxLength(MAX_BATCH_CALLS)),
	),
})

export type SimulationRequest = z.infer<typeof SimulationRequestSchema>

type RpcError = { code: number; message: string; data?: unknown }
type RpcEnvelope<T> = { result?: T; error?: RpcError }

export type SerializedCallResult = {
	status: 'success' | 'reverted'
	gasUsed: Hex.Hex
	returnData: Hex.Hex
	logs: unknown[]
	/** Revert bytes for this call, when it reverted. */
	revertData?: Hex.Hex | undefined
}

export type SerializedExecutionResult = {
	status: 'success' | 'reverted'
	gasUsed: Hex.Hex
	returnData: Hex.Hex
	logs: unknown[]
	blockHash?: Hex.Hex | undefined
	blockNumber?: Hex.Hex | undefined
	/** One entry per call. Length 1 for an ordinary single call. */
	calls: SerializedCallResult[]
}

export type SerializedSimulationResult = {
	/** One entry per call; length 1 for an ordinary single call. */
	trace: unknown[] | null
	prestate: unknown[] | null
	execution: SerializedExecutionResult | null
	errors: {
		callTracer?: string | undefined
		prestate?: string | undefined
		simulate?: string | undefined
	}
}

/**
 * Tracing is the most expensive traffic the explorer sends, so it goes through
 * the authenticated Tempo API rather than the shared public proxy — the same
 * preference the RPC transport makes server-side (`wagmi.config.ts`).
 *
 * Without a key (local dev) or on chains the API does not front, fall back to
 * the public proxy.
 */
function getRpcTarget(chainId: number): {
	url: string
	headers: Record<string, string>
} {
	const apiKey = serverEnv.TEMPO_API_KEY
	if (apiKey && (chainId === tempoMainnet.id || chainId === tempoTestnet.id))
		return {
			url: `${tempoApiUrl}/rpc/${chainId}`,
			headers: { 'tempo-api-key': apiKey },
		}
	return { url: `https://proxy.tempo.xyz/rpc/${chainId}`, headers: {} }
}

async function rpcRequest<T>(args: {
	chainId: number
	method: string
	params: unknown[]
	signal: AbortSignal
}): Promise<T> {
	const target = getRpcTarget(args.chainId)
	const response = await fetch(target.url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...target.headers },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: args.method,
			params: args.params,
		}),
		signal: args.signal,
	})
	if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`)
	const payload = (await response.json()) as RpcEnvelope<T>
	if (payload.error) throw new Error(formatRpcError(args.method, payload.error))
	if (payload.result === undefined) throw new Error('RPC returned no result')
	return payload.result
}

/**
 * Nodes put the actionable part in `error.data` — a bare "Invalid params" with
 * no method and no detail is undiagnosable.
 */
function formatRpcError(method: string, error: RpcError): string {
	const detail =
		typeof error.data === 'string'
			? error.data
			: error.data
				? JSON.stringify(error.data)
				: undefined
	return `${method}: ${error.message}${detail ? ` — ${detail}` : ''}`
}

function rpcBlock(block: SimulationRequest['block']): unknown {
	return block === 'latest' ? block : { blockHash: block }
}

function rpcCall(input: SimulationRequest) {
	return {
		from: input.from,
		to: input.to,
		data: input.data,
		value: numberToHex(BigInt(input.value)),
		gas: numberToHex(BigInt(input.gas)),
	}
}

/** The batch when there is one, otherwise the single call, as RPC call objects. */
function rpcCalls(input: SimulationRequest) {
	if (!input.calls?.length) return [rpcCall(input)]
	return input.calls.map((call) => ({
		from: input.from,
		to: call.to,
		data: call.data,
		value: numberToHex(BigInt(call.value)),
		gas: numberToHex(BigInt(input.gas)),
	}))
}

/**
 * State context for `debug_traceCallMany`.
 *
 * It does not resolve a `blockHash` the way `debug_traceCall` and
 * `eth_simulateV1` do — given the same pinned block it executes against
 * different state, so a replayed batch reported a revert while the execution
 * result reported success. Resolving the hash to a number first makes all
 * three agree. Verified against block 33,553,795: by hash the batch reverts at
 * 103,826 gas, by number it succeeds at 705,700, matching `eth_simulateV1`.
 */
async function traceCallManyContext(
	input: SimulationRequest,
	signal: AbortSignal,
): Promise<unknown> {
	if (input.block === 'latest') return { blockNumber: 'latest' }

	const block = await rpcRequest<{ number?: Hex.Hex } | null>({
		chainId: input.chainId,
		method: 'eth_getBlockByHash',
		params: [input.block, false],
		signal,
	})
	if (!block?.number) throw new Error(`block not found: ${input.block}`)
	return { blockNumber: block.number }
}

/**
 * One trace per call, for one call or twenty.
 *
 * `debug_traceCallMany` runs a bundle sequentially against shared state, so
 * call 2 of an approve→deposit pair traces correctly rather than reverting for
 * want of the approve before it. A one-element bundle returns byte-identical
 * output to `debug_traceCall`, so there is no reason to keep both paths.
 */
async function tracePanel(
	input: SimulationRequest,
	tracer: 'callTracer' | 'prestateTracer',
	signal: AbortSignal,
): Promise<unknown[]> {
	const config =
		tracer === 'callTracer'
			? { tracer, tracerConfig: { withLog: true } }
			: { tracer, tracerConfig: { diffMode: true } }

	const result = await rpcRequest<unknown[][]>({
		chainId: input.chainId,
		method: 'debug_traceCallMany',
		params: [
			[{ transactions: rpcCalls(input) }],
			await traceCallManyContext(input, signal),
			config,
		],
		signal,
	})
	return result[0] ?? []
}

export async function fetchTracePanel(
	input: SimulationRequest,
	signal: AbortSignal,
): Promise<unknown[]> {
	return tracePanel(input, 'callTracer', signal)
}

export async function fetchPrestatePanel(
	input: SimulationRequest,
	signal: AbortSignal,
): Promise<unknown[]> {
	return tracePanel(input, 'prestateTracer', signal)
}

export async function fetchExecutionPanel(
	input: SimulationRequest,
	signal: AbortSignal,
): Promise<SerializedExecutionResult> {
	type RpcCallResult = {
		status: Hex.Hex
		gasUsed: Hex.Hex
		returnData: Hex.Hex
		logs?: unknown[]
		error?: { code: number; message: string; data?: Hex.Hex }
	}
	type RpcBlockResult = {
		hash?: Hex.Hex
		number?: Hex.Hex
		calls: RpcCallResult[]
	}

	const result = await rpcRequest<RpcBlockResult[]>({
		chainId: input.chainId,
		method: 'eth_simulateV1',
		params: [
			{
				blockStateCalls: [{ calls: rpcCalls(input) }],
				traceTransfers: true,
				validation: false,
			},
			rpcBlock(input.block),
		],
		signal,
	})
	const block = result[0]
	if (!block?.calls.length)
		throw new Error('Simulation returned no call result')

	const calls: SerializedCallResult[] = block.calls.map((call) => ({
		status: call.status === '0x1' ? 'success' : 'reverted',
		gasUsed: call.gasUsed,
		returnData: call.returnData,
		logs: call.logs ?? [],
		revertData: call.error?.data,
	}))

	// Aggregate across the batch: it reverted if any call did, gas is the total,
	// and logs concatenate in execution order the way a receipt would show them.
	const total = calls.reduce((sum, call) => sum + BigInt(call.gasUsed), 0n)
	const last = calls[calls.length - 1]
	return {
		status: calls.some((call) => call.status === 'reverted')
			? 'reverted'
			: 'success',
		gasUsed: numberToHex(total),
		returnData: last?.returnData ?? '0x',
		logs: calls.flatMap((call) => call.logs),
		blockHash: block.hash,
		blockNumber: block.number,
		calls,
	}
}

async function settled<T>(promise: Promise<T>) {
	try {
		return { data: await promise }
	} catch (error) {
		return {
			data: null,
			error: error instanceof Error ? error.message : 'Unknown RPC error',
		}
	}
}

export async function runSimulation(
	input: SimulationRequest,
	signal: AbortSignal,
): Promise<SerializedSimulationResult> {
	const [trace, prestate, execution] = await Promise.all([
		settled(fetchTracePanel(input, signal)),
		settled(fetchPrestatePanel(input, signal)),
		settled(fetchExecutionPanel(input, signal)),
	])
	return {
		trace: trace.data,
		prestate: prestate.data,
		execution: execution.data,
		errors: {
			callTracer: trace.error,
			prestate: prestate.error,
			simulate: execution.error,
		},
	}
}

function cacheHeaders(block: SimulationRequest['block']) {
	return {
		'Cache-Control':
			block === 'latest'
				? 'no-store'
				: 'public, max-age=86400, stale-while-revalidate=604800',
	}
}

export const Route = createFileRoute('/api/simulate')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const contentLength = Number(request.headers.get('content-length') ?? 0)
				if (contentLength > MAX_REQUEST_BYTES)
					return Response.json(
						{ error: 'Simulation request is too large' },
						{ status: 413 },
					)

				const limited = await checkRateLimit(request, {
					ip: env.SIMULATE_RATE_LIMITER,
				})
				if (limited) return limited

				const text = await request.text()
				if (text.length > MAX_REQUEST_BYTES)
					return Response.json(
						{ error: 'Simulation request is too large' },
						{ status: 413 },
					)

				let json: unknown
				try {
					json = JSON.parse(text)
				} catch {
					return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
				}

				const parsed = z.safeParse(SimulationRequestSchema, json)
				if (!parsed.success)
					return Response.json(
						{ error: z.prettifyError(parsed.error) },
						{ status: 400 },
					)

				const timeout = AbortSignal.timeout(SIMULATION_TIMEOUT_MS)
				try {
					const input = parsed.data
					const result = input.panel
						? input.panel === 'trace'
							? { trace: await fetchTracePanel(input, timeout) }
							: input.panel === 'prestate'
								? { prestate: await fetchPrestatePanel(input, timeout) }
								: { execution: await fetchExecutionPanel(input, timeout) }
						: await runSimulation(input, timeout)
					return Response.json(result, {
						headers: cacheHeaders(input.block),
					})
				} catch (error) {
					if (timeout.aborted)
						return Response.json(
							{ error: 'Simulation timed out' },
							{ status: 504 },
						)
					return Response.json(
						{
							error:
								error instanceof Error ? error.message : 'Simulation failed',
						},
						{ status: 502 },
					)
				}
			},
		},
	},
})
