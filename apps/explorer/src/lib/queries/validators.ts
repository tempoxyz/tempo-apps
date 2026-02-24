import { queryOptions } from '@tanstack/react-query'
import { getTempoEnv, isTestnet } from '#lib/env'

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

export const SIGNET_BLOCK_BUILDERS: Validator[] = [
	{
		validatorAddress: '0x97e4cc82847511c7cd1790fab6937ab2abdef6ad',
		active: true,
	},
	{
		validatorAddress: '0x056997a0a5Da08dCa9410945Fb7aA8daba39d45D',
		active: true,
	},
	{
		validatorAddress: '0x21c10426Fa5101ab80042aC6CF89f65a7D9e7BCb',
		active: true,
	},
	{
		validatorAddress: '0x3F6b5FCB744E5AeaAF3A6F5cCb2FD64C84aB99a2',
		active: true,
	},
]

const isSignetEnv = () => {
	const env = getTempoEnv()
	return env === 'parmigiana' || env === 'host'
}

const getValidatorNetwork = () => (isTestnet() ? 'testnet' : 'mainnet')

export function validatorsQueryOptions() {
	if (isSignetEnv()) {
		return queryOptions({
			queryKey: ['validators', 'signet'],
			queryFn: async () => SIGNET_BLOCK_BUILDERS,
			staleTime: Number.POSITIVE_INFINITY,
		})
	}

	const network = getValidatorNetwork()
	return queryOptions({
		queryKey: ['validators', network],
		queryFn: async () => {
			const url = `${VALIDATOR_DIRECTORY_URL}/validators?network=${network}`

			try {
				const response = await fetch(url)
				if (!response.ok) {
					return []
				}

				const data = (await response.json()) as ValidatorDirectoryResponse
				return data.validators
			} catch {
				return []
			}
		},
		staleTime: 60_000,
	})
}
