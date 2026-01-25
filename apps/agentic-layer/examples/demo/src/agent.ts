import { Agent } from '../../../packages/sdk/src'
import { config } from './config'

/**
 * Demo Agent: Demonstrates autonomous 402 settlement.
 * The SDK automatically intercepts 402 challenges and executes payments.
 */
async function runAgent() {
	console.log(`[402-Agent] Initializing with RPC: ${config.rpcUrl}`)

	const agent = new Agent({
		privateKey: config.clientPrivateKey as `0x${string}`,
		rpcUrl: config.rpcUrl,
	})

	const targetUrl = `${config.serverUrl}/premium-data`
	console.log(`[402-Agent] Requesting premium data from ${targetUrl}...`)

	try {
		const response = await agent.request({
			method: 'GET',
			url: targetUrl,
		})

		console.log(`[402-Agent] SUCCESS: Settlement verified. Access granted.`)
		console.log(`[402-Agent] Response Payload:`, JSON.stringify(response.data, null, 2))
	} catch (error: unknown) {
		console.error(`[402-Agent] FAILURE: Settlement or execution error.`)
		if (error instanceof Error) {
			console.error(`[402-Agent] Error Diagnostic: ${error.message}`)
		} else {
			console.error(`[402-Agent] Unknown error:`, error)
		}
	}
}

runAgent()
