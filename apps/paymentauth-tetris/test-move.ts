/**
 * Test script to verify pay-per-move functionality
 *
 * Usage: npx tsx test-move.ts [action]
 * Where action is: left, right, rotate, drop
 */

import {
	createPublicClient,
	createWalletClient,
	encodeFunctionData,
	http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { Abis } from 'viem/tempo'

const API_URL = process.env.API_URL || 'http://localhost:3002'
const PRIVATE_KEY =
	(process.env.PRIVATE_KEY as `0x${string}`) ||
	'0xf25e9a31ed4c02663e2095f0464ff011df1e1fc21cc7ef8de1dd8b5295fd0559'

async function main() {
	const action = process.argv[2] || 'left'

	console.log(`\n🎮 PAY-TO-PLAY TETRIS TEST`)
	console.log(`Action: ${action}`)
	console.log(`API: ${API_URL}`)

	// Setup account
	const account = privateKeyToAccount(PRIVATE_KEY)
	console.log(`Wallet: ${account.address}`)

	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http('https://rpc.moderato.tempo.xyz'),
	})

	const walletClient = createWalletClient({
		account,
		chain: tempoModerato,
		transport: http('https://rpc.moderato.tempo.xyz'),
	})

	// Step 1: Get current state
	console.log(`\n📺 Current game state:`)
	const stateRes = await fetch(`${API_URL}/state`)
	const state = await stateRes.json()
	console.log(state.ascii)
	console.log(`Moves: ${state.metadata.moveCount}`)

	// Step 2: Request move (get 402 challenge)
	console.log(`\n🔐 Requesting move (expecting 402)...`)
	const challengeRes = await fetch(`${API_URL}/move/${action}`, {
		method: 'POST',
	})

	if (challengeRes.status !== 402) {
		console.log(`Unexpected status: ${challengeRes.status}`)
		console.log(await challengeRes.text())
		return
	}

	// Parse challenge
	const wwwAuth = challengeRes.headers.get('www-authenticate')
	if (!wwwAuth) throw new Error('No WWW-Authenticate header')

	const challenge = parseWwwAuthenticate(wwwAuth)
	console.log(`Challenge ID: ${challenge.id}`)
	console.log(
		`Amount: ${challenge.request.amount} (${Number(challenge.request.amount) / 1e6} USD)`,
	)
	console.log(`Destination: ${challenge.request.destination}`)

	// Step 3: Sign payment transaction
	console.log(`\n💳 Signing payment transaction...`)

	const transferData = encodeFunctionData({
		abi: Abis.tip20,
		functionName: 'transfer',
		args: [challenge.request.destination, BigInt(challenge.request.amount)],
	})

	const nonce = await publicClient.getTransactionCount({
		address: account.address,
	})
	console.log(`Nonce: ${nonce}`)

	// Get current gas prices
	const gasPrice = await publicClient.getGasPrice()
	console.log(`Gas price: ${gasPrice}`)

	const signedTx = await walletClient.signTransaction({
		to: challenge.request.asset as `0x${string}`,
		data: transferData,
		nonce,
		gas: 100000n,
		maxFeePerGas: gasPrice * 2n,
		maxPriorityFeePerGas: gasPrice,
	})
	console.log(`Signed tx: ${signedTx.slice(0, 40)}...`)

	// Step 4: Submit payment
	console.log(`\n🚀 Submitting payment...`)

	const credential = {
		id: challenge.id,
		payload: {
			type: 'transaction',
			signature: signedTx,
		},
	}

	// Format as: Payment <base64url-encoded JSON>
	const credentialJson = JSON.stringify(credential)
	const base64url = Buffer.from(credentialJson)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
	const authHeader = `Payment ${base64url}`

	const moveRes = await fetch(`${API_URL}/move/${action}`, {
		method: 'POST',
		headers: { Authorization: authHeader },
	})

	const result = await moveRes.json()

	if (!moveRes.ok) {
		console.log(`❌ Move failed: ${result.message || result.error}`)
		return
	}

	console.log(`✅ Move successful!`)
	console.log(`\n📺 New game state:`)
	console.log(result.ascii)
	console.log(`\n🧾 Receipt:`)
	console.log(`  TX Hash: ${result.receipt.txHash}`)
	console.log(`  Explorer: ${result.receipt.explorer}`)
	console.log(`  Moves: ${result.metadata.moveCount}`)
}

function parseWwwAuthenticate(header: string) {
	const match = header.match(/^Payment\s+(.+)$/)
	if (!match) throw new Error('Invalid WWW-Authenticate')

	const params: Record<string, string> = {}
	const regex = /(\w+)="([^"]+)"/g
	let m: RegExpExecArray | null = regex.exec(match[1])
	while (m !== null) {
		params[m[1]] = m[2]
		m = regex.exec(match[1])
	}

	if (params.request) {
		params.request = JSON.parse(
			Buffer.from(params.request, 'base64').toString(),
		)
	}

	return params as unknown as {
		id: string
		realm: string
		method: string
		intent: string
		request: {
			amount: string
			asset: string
			destination: string
			expires: string
		}
		expires: string
		description: string
	}
}

main().catch(console.error)
