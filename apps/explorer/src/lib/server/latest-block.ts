import { createServerFn } from '@tanstack/react-start'
import { getBlockNumber, getChainId } from 'wagmi/actions'
import { getTempoEnv } from '#lib/env'
import { fetchLatestBlockNumber } from '#lib/server/tempo-queries'
import { getWagmiConfig } from '#wagmi.config'

export const fetchLatestBlock = createServerFn({ method: 'GET' }).handler(
	async () => {
		try {
			const config = getWagmiConfig()
			if (getTempoEnv() === 'localnet') return await getBlockNumber(config)

			const chainId = getChainId(config)

			return await fetchLatestBlockNumber(chainId)
		} catch (error) {
			console.error('Failed to fetch latest block:', error)
			return 0n
		}
	},
)
