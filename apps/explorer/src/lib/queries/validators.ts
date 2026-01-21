import { queryOptions } from '@tanstack/react-query'
import { Abis } from 'viem/tempo'
import { readContract } from 'wagmi/actions'
import { getWagmiConfig } from '#wagmi.config.ts'

const VALIDATOR_CONFIG_ADDRESS =
	'0xcccccccc00000000000000000000000000000000' as const

export type Validator = {
	publicKey: `0x${string}`
	active: boolean
	index: bigint
	validatorAddress: `0x${string}`
	inboundAddress: string
	outboundAddress: string
}

export function validatorsQueryOptions() {
	return queryOptions({
		queryKey: ['validators'],
		queryFn: async () => {
			const config = getWagmiConfig()
			const validators = await readContract(config, {
				address: VALIDATOR_CONFIG_ADDRESS,
				abi: Abis.validator,
				functionName: 'getValidators',
			})

			return validators as Validator[]
		},
		staleTime: 60_000,
	})
}
