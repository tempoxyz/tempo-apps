#!/usr/bin/env node

const { createPublicClient, http, walletActions } = require('viem')
const createClient = createPublicClient
const { privateKeyToAccount } = require('viem/accounts')
const { tempo } = require('tempo.ts/chains')
const { withFeePayer } = require('tempo.ts/viem')

// Configuration
const SPONSOR_URL = process.env.SPONSOR_URL || 'http://localhost:8787' // Local wrangler dev URL
const TEST_PRIVATE_KEY =
	process.env.TEST_PRIVATE_KEY ||
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const RECIPIENT = '0x9761812cADB002BB89c90ec0b15304F9B008E14C'

async function testSponsor() {
	console.log('🚀 Testing Tempo Sponsor Service\n')
	console.log('Configuration:')
	console.log(`  Sponsor URL: ${SPONSOR_URL}`)
	console.log(
		`  Test Account: ${privateKeyToAccount(TEST_PRIVATE_KEY).address}`,
	)
	console.log(`  Recipient: ${RECIPIENT}\n`)

	try {
		// Create client with fee payer
		const client = createClient({
			account: privateKeyToAccount(TEST_PRIVATE_KEY),
			chain: tempo({ feeToken: '0x20c0000000000000000000000000000000000001' }),
			transport: withFeePayer(
				http('https://rpc.testnet.tempo.xyz', {
					fetchOptions: {
						headers: {
							Authorization: `Basic ${btoa('eng:zealous-mayer')}`,
						},
					},
				}),
				http(SPONSOR_URL),
			),
		}).extend(walletActions)

		console.log('📝 Sending sponsored transaction...\n')

		// Send a sponsored transaction
		const hash = await client.sendTransaction({
			feePayer: true,
			to: RECIPIENT,
			value: 0n,
		})

		function sleep(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms))
		}
		await sleep(1000)

		const receipt = await client.getTransactionReceipt({ hash })
		console.log(hash)
		console.log(receipt)
	} catch (error) {
		console.error('❌ Error testing sponsor:', error.message)
		if (error.cause) {
			console.error('Cause:', error.cause)
		}
		process.exit(1)
	}
}

async function testErrorHandling() {
	console.log('\n🧪 Testing error handling...\n')

	// Test 1: Invalid transaction data should return JSON-RPC error
	try {
		const response = await fetch(SPONSOR_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_sendRawTransaction',
				params: ['0x76invalid'], // Invalid serialized transaction
			}),
		})

		const data = await response.json()
		console.log('Error response:', JSON.stringify(data, null, 2))

		if (data.error && data.error.code === -32000) {
			console.log(
				'✅ Error handling test passed: received proper JSON-RPC error',
			)
		} else {
			console.error('❌ Error handling test failed: expected JSON-RPC error')
			process.exit(1)
		}
	} catch (error) {
		console.error('❌ Error handling test failed:', error.message)
		process.exit(1)
	}
}

// Run tests
async function main() {
	// Check if running locally
	const isLocal =
		SPONSOR_URL.includes('localhost') || SPONSOR_URL.includes('127.0.0.1')

	if (isLocal) {
		console.log(
			'⚠️  Testing against local server. Make sure to run `pnpm dev` in another terminal.\n',
		)
	}

	// Test error handling first
	await testErrorHandling()

	// Then run full integration test
	await testSponsor()
}

main().catch(console.error)
