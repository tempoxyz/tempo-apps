import { createServer, port } from './prool.js'

const tempoEnv = (process.env.TEMPO_ENV ?? 'localnet') as string

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
	if (tempoEnv !== 'localnet') return

	console.log('[globalSetup] Starting local Tempo via Prool...')
	try {
		const server = await createServer()
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
