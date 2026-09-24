import { ZONE_PROVER_RPC_URL } from '#lib/zone-prover'

const READ_METHODS = new Set([
	'eth_chainId',
	'eth_blockNumber',
	'eth_getBlockByNumber',
	'eth_getBlockByHash',
	'eth_getBlockTransactionCountByNumber',
	'eth_getBlockTransactionCountByHash',
	'eth_getTransactionByHash',
	'eth_getTransactionReceipt',
	'eth_getBlockReceipts',
	'eth_getTransactionByBlockHashAndIndex',
	'eth_getTransactionByBlockNumberAndIndex',
	'eth_getBalance',
	'eth_getCode',
	'eth_getStorageAt',
	'eth_getProof',
	'eth_getTransactionCount',
	'eth_getLogs',
	'eth_call',
	'eth_estimateGas',
	'eth_gasPrice',
	'eth_maxPriorityFeePerGas',
	'eth_feeHistory',
	'net_version',
	'web3_clientVersion',
])
const MAX_BODY_BYTES = 128 * 1024
const MAX_BATCH = 50

export async function forwardProverRpc(
	request: Request,
	authorization: string,
): Promise<Response> {
	const reader = request.body?.getReader()
	if (!reader) return new Response('Missing RPC request', { status: 400 })
	const chunks: Uint8Array[] = []
	let length = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		length += value.byteLength
		if (length > MAX_BODY_BYTES) {
			await reader.cancel()
			return new Response('RPC request too large', { status: 413 })
		}
		chunks.push(value)
	}
	const bytes = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.length
	}
	const body = new TextDecoder().decode(bytes)
	let payload: unknown
	try {
		payload = JSON.parse(body)
	} catch {
		return new Response('Invalid JSON', { status: 400 })
	}
	const calls: unknown[] = Array.isArray(payload) ? payload : [payload]
	if (
		!calls.length ||
		calls.length > MAX_BATCH ||
		calls.some((call) => {
			if (!call || typeof call !== 'object') return true
			const rpc = call as Record<string, unknown>
			return (
				rpc.jsonrpc !== '2.0' ||
				typeof rpc.method !== 'string' ||
				!READ_METHODS.has(rpc.method) ||
				(rpc.params !== undefined && !Array.isArray(rpc.params))
			)
		})
	)
		return new Response('Unsupported RPC request', { status: 400 })
	try {
		const upstream = await fetch(ZONE_PROVER_RPC_URL, {
			method: 'POST',
			body,
			headers: {
				'Content-Type': 'application/json',
				Authorization: authorization,
			},
			// Workers does not support 'error'; reject redirects via !upstream.ok below.
			redirect: 'manual',
			signal: AbortSignal.timeout(15_000),
		})
		if (!upstream.ok)
			return new Response('Prover RPC unavailable', { status: 502 })
		return new Response(upstream.body, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		})
	} catch {
		return new Response('Prover RPC unavailable', { status: 502 })
	}
}
