import { Server } from 'prool'
import * as TestContainers from 'prool/testcontainers'

export const port = 9545

export const rpcUrl = (() => {
	if (process.env.TEMPO_ENV === 'testnet')
		return 'https://rpc.testnet.tempo.xyz'
	// Localnet - use pool ID for parallel test isolation
	const poolId = Number(process.env.VITEST_POOL_ID ?? 1)
	return `http://localhost:${port}/${poolId}`
})()

export async function createServer() {
	const tag = process.env.TEMPO_TAG ?? 'latest'
	return Server.create({
		instance: TestContainers.Instance.tempo({
			blockTime: '2ms',
			port,
			image: `ghcr.io/tempoxyz/tempo:${tag}`,
		}),
		port,
	})
}
