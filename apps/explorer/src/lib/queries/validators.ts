import { queryOptions } from '@tanstack/react-query'

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

export function validatorsQueryOptions() {
	return queryOptions({
		queryKey: ['validators', 'mainnet'],
		queryFn: async () => {
			const url = `${VALIDATOR_DIRECTORY_URL}/validators?network=mainnet`

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
