import { http } from 'viem'

interface RpcAuthEnv {
	readonly TEMPO_RPC_AUTH?: string
}

export function getRpcAuthorizationHeader(env: RpcAuthEnv): string | undefined {
	return env.TEMPO_RPC_AUTH ? `Basic ${btoa(env.TEMPO_RPC_AUTH)}` : undefined
}

export function createRpcTransport(
	rpcUrl: string | undefined,
	fallbackRpcUrl: string,
	env: RpcAuthEnv,
) {
	const authorization = getRpcAuthorizationHeader(env)

	return http(
		rpcUrl ?? fallbackRpcUrl,
		authorization
			? { fetchOptions: { headers: { Authorization: authorization } } }
			: undefined,
	)
}
