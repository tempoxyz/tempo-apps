import { createServerFn } from '@tanstack/react-start'
import { getBlockNumber } from 'wagmi/actions'
import { getWagmiConfig } from '#wagmi.config'

export const fetchLatestBlock = createServerFn({ method: 'GET' }).handler(
	async () => {
		try {
			return await getBlockNumber(getWagmiConfig())
		} catch (error) {
			console.error('Failed to fetch latest block:', error)
			return 0n
		}
	},
)
