import { ZONE_PROVER_RPC_URL } from '#lib/zone-prover'
import { forwardRpc, READ_METHODS } from './rpc'

/** The prover endpoint remains read-only. */
export function forwardProverRpc(request: Request, authorization: string) {
	return forwardRpc(
		request,
		{
			url: ZONE_PROVER_RPC_URL,
			headers: { Authorization: authorization },
		},
		READ_METHODS,
	)
}
