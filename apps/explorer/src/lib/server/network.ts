import { getTempoEnv } from '#lib/env'
import { zoneProverTarget } from '#lib/zone-prover'
import { serverEnv } from './env'

export function getZoneProverTarget(kind: 'rpc' | 'tidx') {
	return zoneProverTarget(kind)
}

export function networkCacheScope() {
	const network = getTempoEnv()
	return network === 'zone-prover'
		? `${network}:${serverEnv.ZONE_PROVER_DATA_EPOCH || 'initial'}`
		: network
}
