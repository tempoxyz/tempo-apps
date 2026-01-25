import { TempoAgent } from '@tempo/402-sdk'
import type { Hex } from 'viem'

const agent = new TempoAgent({
	privateKey: (process.env.CLIENT_PRIVATE_KEY || `0x${'1'.repeat(64)}`) as Hex,
	rpcUrl: process.env.TEMPO_RPC_URL,
})

async function run() {
	console.log('[Client] Requesting expensive intelligence...')
	const res1 = await agent.request({
		url: 'http://localhost:3002/api/v1/intelligence',
	})
	console.log('[Client] Intelligence:', res1.data)

	console.log('[Client] Requesting cheap data...')
	const res2 = await agent.request({
		url: 'http://localhost:3002/api/v1/cheap',
	})
	console.log('[Client] Cheap data:', res2.data)
}

run().catch(console.error)
