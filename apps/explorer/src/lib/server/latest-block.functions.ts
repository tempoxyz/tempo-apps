import { createServerFn } from '@tanstack/react-start'

export const fetchLatestBlock = createServerFn({ method: 'GET' }).handler(
	async () => {
		const { fetchLatestBlockImpl } = await import('./latest-block.server.ts')
		return fetchLatestBlockImpl()
	},
)
