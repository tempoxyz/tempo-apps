import { tempo, tempoModerato } from '@wagmi/core/chains'
import { http } from 'viem'

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
) {
	const authorization = getRpcAuthorizationHeader(chainId, env)

	return http(
		rpcUrl,
		authorization
			? { fetchOptions: { headers: { Authorization: authorization } } }
			: undefined,
	)
}
