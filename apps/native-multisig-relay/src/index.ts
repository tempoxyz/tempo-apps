import { env } from 'cloudflare:workers'
import { Handler } from 'accounts/server'
import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoChain, tempoFeeToken, tempoTokens } from './lib/chain.js'
import { createMultisigStore } from './lib/multisig-store.js'

const app = new Hono()

app.onError((error, c) => {
	if (error instanceof HTTPException) return error.getResponse()

	console.error('Unexpected error:', error)
	return c.text('Internal Server Error', 500)
})

app.use(
	'*',
	cors({
		origin: (origin) => {
			if (env.ALLOWED_ORIGINS === '*') return '*'
			if (origin && env.ALLOWED_ORIGINS.includes(origin)) return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		maxAge: 86400,
	}),
)

app.get('/health', (c) =>
	c.json({
		ok: true,
		chainId: tempoChain.id,
		sponsored: Boolean(env.SPONSOR_PRIVATE_KEY),
	}),
)

app.get('/', (c) =>
	c.json({
		ok: true,
		chainId: tempoChain.id,
		sponsored: Boolean(env.SPONSOR_PRIVATE_KEY),
	}),
)

const sponsor = env.SPONSOR_PRIVATE_KEY
	? {
			account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
			feeToken: tempoFeeToken,
			name: env.SPONSOR_NAME ?? 'Tempo Multisig Relay',
			url: env.SPONSOR_URL ?? 'https://multisig-relay.tempo.xyz',
		}
	: undefined

const relayHandler = Handler.relay({
	cors: false,
	chains: [tempoChain],
	features: 'all',
	...(sponsor ? { feePayer: sponsor } : {}),
	multisig: {
		finalize: 'sync',
		store: createMultisigStore(env.MultisigOperationStore),
	},
	resolveTokens: () => tempoTokens,
	transports: {
		[tempoChain.id]: http(
			env.TEMPO_RPC_URL ?? tempoChain.rpcUrls.default.http[0],
		),
	},
} as never)

async function relay(c: Context) {
	return relayHandler.fetch(c.req.raw)
}

app.post('/', relay)
app.post('/:chainId', relay)

export default app
