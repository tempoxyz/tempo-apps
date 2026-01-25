import { SettlementHandler, createSettlementTool } from '@tempo/402-sdk'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// 1. Initialize Settlement
const account = privateKeyToAccount('0x...')
const settlement = new SettlementHandler({
	publicClient: createPublicClient({ transport: http() }),
	walletClient: createWalletClient({ account, transport: http() }),
})

// 2. Create Tool
const tempoTool = createSettlementTool(settlement)

// 3. Simulated Agent Loop
async function agentLoop() {
	console.log('Agent starting mission...')

	// Simulate receiving a 402 error from an API
	const paymentRequirement = {
		amount: '100000',
		recipient: '0x123...',
		rpcUrl: 'https://rpc.moderato.tempo.xyz',
	}

	console.log(
		`Agent: "I need to pay ${paymentRequirement.amount} to proceed. Using Tempo tool..."`,
	)

	const txHash = await tempoTool.func(paymentRequirement)

	console.log(`Agent: "Payment successful! TX: ${txHash}. Retrying request..."`)
}

agentLoop().catch(console.error)
