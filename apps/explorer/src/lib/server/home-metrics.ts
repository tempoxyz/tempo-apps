import { createServerFn } from '@tanstack/react-start'
import { getChainId } from 'wagmi/actions'
import { hasIndexSupply } from '#lib/env'
import {
	fetchExplorerHomepageMetrics,
	type ExplorerHomepageMetrics,
} from '#lib/server/tempo-queries'
import { getWagmiConfig } from '#wagmi.config'

export const fetchHomepageMetrics = createServerFn({ method: 'GET' }).handler(
	async (): Promise<ExplorerHomepageMetrics | null> => {
		if (!hasIndexSupply()) return null

		try {
			const config = getWagmiConfig()
			const chainId = getChainId(config)

			return await fetchExplorerHomepageMetrics(chainId)
		} catch (error) {
			console.error('Failed to fetch homepage metrics:', error)
			return null
		}
	},
)
