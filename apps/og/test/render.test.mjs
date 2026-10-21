import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { after, before, test } from 'node:test'

let origin
let worker
let failure
let logs = ''
before(async () => {
	// Let the OS allocate both ports so parallel runs cannot hit a stale worker.
	worker = spawn(
		'pnpm',
		[
			'exec',
			'wrangler',
			'dev',
			'--ip',
			'127.0.0.1',
			'--port',
			'0',
			'--inspector-port',
			'0',
		],
		{
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	)
	worker.once('error', (error) => {
		failure = error
	})
	worker.once('exit', (code, signal) => {
		failure = new Error(`OG worker exited (${signal ?? code}): ${logs}`)
	})
	for (const stream of [worker.stdout, worker.stderr])
		stream.on('data', (chunk) => {
			logs = (logs + chunk).slice(-12000)
			// Probe only the URL announced by this child, never an existing server.
			origin ??= logs.match(/Ready on (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
		})
	const deadline = Date.now() + 45_000
	while (Date.now() < deadline) {
		if (failure) throw failure
		if (origin) {
			try {
				const response = await fetch(`${origin}/health`, {
					signal: AbortSignal.timeout(1_000),
				})
				if (response.ok && (await response.text()) === 'OK' && !failure) return
			} catch {}
		}
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	throw new Error(`OG worker did not start: ${logs}`)
})
after(async () => {
	if (!worker?.pid) return
	const signalGroup = (signal) => {
		try {
			process.kill(-worker.pid, signal)
		} catch (error) {
			if (error.code !== 'ESRCH') throw error
		}
	}
	await new Promise((resolve) => {
		const timeout = setTimeout(() => {
			signalGroup('SIGKILL')
			resolve()
		}, 5_000)
		worker.once('close', () => {
			clearTimeout(timeout)
			resolve()
		})
		signalGroup('SIGTERM')
		if (worker.exitCode !== null || worker.signalCode !== null) {
			clearTimeout(timeout)
			resolve()
		}
	})
})

const hash = `0x${'48'.repeat(32)}`
const address = `0x${'20'.repeat(20)}`
const receipt = new URLSearchParams({
	block: '8188645',
	sender: address,
	date: '03/12/2026',
	time: '19:59:07',
	fee: '<$0.01',
	total: '$20.39',
	ev1: 'Tokens Swapped|20.386904 AlphaUSD for 20.384865 BetaUSD|$20.39',
	status: 'success',
})
for (const [name, path] of [
	['homepage', '/explorer'],
	['legacy homepage image', '/bg-default.webp'],
	['legacy block image', '/og-blocks.webp'],
	['legacy token image', '/og-tokens.webp'],
	['legacy transaction image', '/og-transactions.webp'],
	['block listing', '/blocks'],
	['token listing', '/tokens'],
	['transaction fallback', '/tx'],
	['transaction', `/tx/${hash}?${receipt}`],
	['receipt', `/receipt/${hash}?${receipt}`],
	['failed receipt', `/receipt/${hash}?status=reverted&eventsFailed=true`],
	['empty receipt', `/receipt/${hash}`],
	['block', '/block/8188645?number=8188645&txCount=42&gasUsage=52'],
	[
		'token',
		`/token/${address}?name=AlphaUSD&symbol=AlphaUSD&currency=USD&supply=1000000&holders=1234`,
	],
	[
		'account',
		`/address/${address}?holdings=%241234&txCount=500&accountType=account`,
	],
	[
		'contract',
		`/address/${address}?accountType=contract&contractName=Payment%20Router`,
	],
	['empty account', `/address/${address}?accountType=empty`],
	[
		'long receipt',
		`/receipt/${hash}?${receipt}&ev2=${encodeURIComponent(`Transfer|${'Long details '.repeat(30)}`)}&ev3=Mint|1000%20USD&ev4=Burn|100%20USD`,
	],
])
	test(`renders ${name}`, async () => {
		const response = await fetch(origin + path)
		assert.equal(
			response.status,
			200,
			await response
				.clone()
				.text()
				.then((s) => s.slice(0, 100)),
		)
		assert.match(response.headers.get('content-type'), /image\/webp/)
		const body = Buffer.from(await response.arrayBuffer())
		assert.equal(body.toString('ascii', 0, 4), 'RIFF')
		assert.equal(body.toString('ascii', 8, 12), 'WEBP')
		assert.ok(body.length > 1000, 'Rendered image must contain content')
	})
for (const path of [
	'/receipt/invalid',
	'/tx/invalid',
	'/address/invalid',
	'/token/invalid',
])
	test(`rejects ${path}`, async () => {
		assert.equal((await fetch(origin + path)).status, 400)
	})
