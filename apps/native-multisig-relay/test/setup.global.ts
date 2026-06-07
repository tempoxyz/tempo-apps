import { existsSync } from 'node:fs'
import { createPublicClient, http } from 'viem'
import { tempoModerato } from 'viem/chains'
import { createServer, port } from './prool.js'

async function getCurrentTempoModeratoTag(): Promise<string> {
	const client = createPublicClient({
		chain: tempoModerato,
		transport: http(),
	})
	const clientVersion = await client.request({ method: 'web3_clientVersion' })
	const sha = clientVersion.split('/')[1]?.split('-').pop()
	if (!sha) throw new Error(`Unexpected web3_clientVersion: ${clientVersion}`)
	return `sha-${sha}`
}

async function waitForTempo(maxRetries = 10, delayMs = 500): Promise<void> {
	const url = `http://localhost:${port}/1`
	for (let i = 0; i < maxRetries; i++) {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'web3_clientVersion',
				}),
			})
			if (response.ok) return
		} catch {
			// Retry until Prool finishes binding the RPC port.
		}
		await new Promise((r) => setTimeout(r, delayMs))
	}
	throw new Error(`Tempo not responding at ${url} after ${maxRetries} retries.`)
}

export default async function globalSetup() {
	if ((process.env.TEMPO_ENV ?? 'localnet') !== 'localnet') return

	const localBinary = `${process.env.HOME}/github/tempoxyz/tempo/target/debug/tempo`
	const tag =
		process.env.TEMPO_TAG ??
		(existsSync(localBinary) ? localBinary : await getCurrentTempoModeratoTag())

	console.log('[globalSetup] Starting Tempo localnet via Prool...', { tag })
	const server = await createServer(tag)
	const teardown = await server.start()
	await waitForTempo()
	return teardown
}
