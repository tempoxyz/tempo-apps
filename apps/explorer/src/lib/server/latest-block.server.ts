import { createServerFn } from '@tanstack/react-start'
import { hasIndexSupply } from '#lib/env'
import { fetchLatestBlockNumber } from '#lib/server/tempo-queries'
import { getServerChainId } from '#wagmi.config'

export const fetchLatestBlock = createServerFn({ method: 'GET' }).handler(
	async () => {
		if (!hasIndexSupply()) return 0n
		try {
			const chainId = getServerChainId()

			return await fetchLatestBlockNumber(chainId)
		} catch (error) {
			console.error('Failed to fetch latest block:', error)
			return 0n
		}
	},
)
