import { createPublicClient, http } from 'viem'
import { tempoTestnet } from 'viem/chains'
import { createServer, port } from './prool.js'

async function getCurrentTempoTestnetTag(): Promise<string> {
	const client = createPublicClient({
		chain: tempoTestnet,
		transport: http(),
	})
	const clientVersion = await client.request({ method: 'web3_clientVersion' })
	// clientVersion format: "tempo/v0.8.0-6318f1a/x86_64-unknown-linux-gnu"
	const sha = clientVersion.split('/')[1].split('-').pop()
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
			if (response.ok) {
				console.log('[globalSetup] Tempo is ready')
				return
			}
		} catch {
			// Retry
		}
		await new Promise((r) => setTimeout(r, delayMs))
	}
	throw new Error(
		`Tempo not responding at ${url} after ${maxRetries} retries. Is Docker running?`,
	)
}

export default async function globalSetup() {
	if ((import.meta.env.TEMPO_ENV ?? 'localnet') !== 'localnet') return

	const tempoTag = (import.meta.env.TEMPO_TAG ??
		(await getCurrentTempoTestnetTag())) as string

	console.log('[globalSetup] Starting local Tempo via Prool...', {
		tempoTag,
	})
	try {
		const server = await createServer(tempoTag)
		console.log('[globalSetup] Server created, starting...')
		const teardown = await server.start()
		console.log(
			'[globalSetup] Server started, waiting for Tempo to be ready...',
		)
		await waitForTempo()
		return teardown
	} catch (error) {
		console.error('[globalSetup] Failed to start Tempo:', error)
		throw error
	}
}
