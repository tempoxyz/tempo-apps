type HttpRouteTags = {
	method: string
	route: string
}

type RpcTags = {
	rpc_method: string
	keyed_route: string
	chain_id: string
}

export type MetricRegistry = {
	http_request_count: HttpRouteTags
	http_response_count: HttpRouteTags & {
		status: number
		error_type?: string
	}
	http_response_duration_ms: HttpRouteTags
	fee_payer_rpc_request_count: RpcTags
	fee_payer_rpc_response_duration_ms: RpcTags
	fee_payer_relay_duration_ms: Pick<RpcTags, 'rpc_method' | 'keyed_route'>
	fee_payer_sponsorship_response_count: RpcTags & {
		status: string
	}
}
