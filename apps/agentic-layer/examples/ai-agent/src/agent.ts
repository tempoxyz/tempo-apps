import { TempoAgent } from '@tempo/402-sdk'
import { config } from './config.js'
import type { Hex } from 'viem'

/**
 * Advanced AI Agent Client.
 * Demonstrates an autonomous agent that makes decisions before paying.
 */
class AutonomousAgent {
	private agent: TempoAgent

	constructor() {
		this.agent = new TempoAgent({
			privateKey: config.agentPrivateKey as Hex,
			rpcUrl: config.rpcUrl,
		})
	}

	public async executeMission(symbol: string) {
		const goal = `Acquire urgent market intelligence for ${symbol}`
		const url = `${config.serverUrl}/api/analyze-market?symbol=${symbol}`

		// This simulation shows how the agent can intercept info *before* letting the SDK pay
		// In a real flow, the SDK handles the 402, but the agent manages the overall budget
		try {
			console.log(`[Agent] Mission Start: ${goal}`)

			const res = await this.agent.request({ url })

			console.log(`[Agent] Mission Success!`)
			console.log(`[Agent] Data received:`, res.data)
		} catch (error: any) {
			if (error.code === 'PAYMENT_FAILURE') {
				console.error(
					`[Agent] Mission Aborted: Financial limit reached or settlement failed.`,
				)
				console.error(`[Agent] Reasoning: ${error.fix}`)
			} else {
				console.error(`[Agent] Unexpected Error:`, error.message)
			}
		}
	}
}

const bot = new AutonomousAgent()
bot.executeMission('TEMPO')
bot.executeMission('BITCOIN')
