import { queryOptions } from '@tanstack/react-query'
import { isTestnet } from '#lib/env'

const VALIDATOR_DIRECTORY_URL =
	'https://tempo-validator-directory.porto.workers.dev'

export type Validator = {
	validatorAddress: `0x${string}`
	name?: string
	publicKey?: `0x${string}`
	active?: boolean
}

type ValidatorDirectoryResponse = {
	network: string
	validators: Validator[]
	updatedAt: string | null
}

const getValidatorNetwork = () => (isTestnet() ? 'testnet' : 'mainnet')

export function validatorsQueryOptions() {
	const network = getValidatorNetwork()
	return queryOptions({
		queryKey: ['validators', network],
		queryFn: async () => {
			const url = `${VALIDATOR_DIRECTORY_URL}/validators?network=${network}`

			const response = await fetch(url)
			if (!response.ok) {
				throw new Error(`Failed to fetch validators: ${response.status}`)
			}

			const data = (await response.json()) as ValidatorDirectoryResponse
			return data.validators
		},
		staleTime: 60_000,
	})
}
