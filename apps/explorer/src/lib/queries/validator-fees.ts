import type { Address } from 'ox'
import { fetchValidatorFees } from '#lib/server/validator-fees'
import { getTempoChain } from '#wagmi.config'

export function validatorFeesQueryOptions(address: Address.Address) {
	return {
		queryKey: ['validator-fees', getTempoChain().id, address.toLowerCase()],
		queryFn: () => fetchValidatorFees({ data: address }),
		staleTime: 15_000,
		retry: false,
	}
}
