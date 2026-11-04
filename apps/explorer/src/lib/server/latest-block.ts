import { createServerFn } from '@tanstack/react-start'
import { getWagmiConfig } from '#wagmi.config'
import { readBlockNumber } from '#lib/server/block-number'

export const fetchLatestBlock = createServerFn({ method: 'GET' }).handler(
	async () => {
		try {
			return await readBlockNumber(getWagmiConfig().getClient())
		} catch (error) {
			console.error('Failed to fetch latest block:', error)
			return 0n
		}
	},
)
