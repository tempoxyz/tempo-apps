import { tempo, tempoModerato } from '@wagmi/core/chains'
import { http, ResponseBodyTooLargeError } from 'viem'

interface RpcAuthEnv {
	readonly TEMPO_MAINNET_RPC_AUTH?: string
	readonly TEMPO_TESTNET_RPC_AUTH?: string
}

export function getRpcAuthorizationHeader(
	chainId: number,
	env: RpcAuthEnv,
): string | undefined {
	const credentials =
		chainId === tempo.id
			? env.TEMPO_MAINNET_RPC_AUTH
			: chainId === tempoModerato.id
				? env.TEMPO_TESTNET_RPC_AUTH
				: undefined

	return credentials ? `Basic ${btoa(credentials)}` : undefined
}

export function createRpcTransport(
	rpcUrl: string | undefined,
	chainId: number,
	env: RpcAuthEnv,
): ReturnType<typeof http> {
	const authorization = getRpcAuthorizationHeader(chainId, env)

	const fetchOptions = authorization
		? { headers: { Authorization: authorization } }
		: undefined
	const regular = http(rpcUrl, { fetchOptions })
	// Trace responses are optional proof, not ordinary chain reads; fail closed above these budgets.
	const trace = http(rpcUrl, {
		fetchOptions,
		maxResponseBodySize: 256 * 1024,
		retryCount: 0,
		timeout: 5_000,
		async onFetchResponse(response) {
			const size = Number(response.headers.get('content-length'))
			if (!(size > 256 * 1024)) return
			// Viem bounds streamed bodies, but its content-length rejection does not cancel the body.
			await response.body?.cancel()
			throw new ResponseBodyTooLargeError({ maxSize: 256 * 1024, size })
		},
	})

	return (options) => {
		const regularTransport = regular(options)
		// The transport factory's timeout takes precedence over http()'s configuration.
		const traceTransport = trace({ ...options, timeout: 5_000 })
		return {
			...regularTransport,
			config: {
				...regularTransport.config,
				request: (args, requestOptions) =>
					args.method === 'debug_traceTransaction'
						? traceTransport.config.request(args, requestOptions)
						: regularTransport.config.request(args, requestOptions),
			},
			request: (args, requestOptions) =>
				args.method === 'debug_traceTransaction'
					? traceTransport.request(args, { ...requestOptions, retryCount: 0 })
					: regularTransport.request(args, requestOptions),
		}
	}
}

/** Preserve nested creation and destruction evidence without collecting logs. */
export const creationTraceOptions = {
	tracer: 'callTracer',
	timeout: '3s',
	tracerConfig: { onlyTopCall: false, withLog: false },
} as const
