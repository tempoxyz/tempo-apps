import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Address } from 'ox'
import { tempo } from 'tempo.ts/chains'
import { Handler } from 'tempo.ts/server'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { runQuery, toBigInt } from './lib/index-supply'

const app = new Hono()

const FEE_MANAGER_CONTRACT = '0xfeec000000000000000000000000000000000000'
const TRANSFER_SIGNATURE =
	'Transfer(address indexed from, address indexed to, uint256 amount)'

app.use(
	'*',
	cors({
		origin: (origin) => {
			if (env.ALLOWED_ORIGINS === '*') return '*'
			if (origin && env.ALLOWED_ORIGINS.includes(origin)) return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	}),
)

async function getUsage(feePayerAddress: Address.Address) {
	const result = await runQuery(
		`
			select
				sum(amount) as total_spent,
				max(block_timestamp) as ending_at,
				min(block_timestamp) as starting_at,
				count(tx_hash) as n_transactions
			from
				transfer
			where
				"from" = '${feePayerAddress}'
				and "to" = '${FEE_MANAGER_CONTRACT}'
			`,
		{ signatures: [TRANSFER_SIGNATURE] },
	)
	const feesPaid = toBigInt(result.rows[0]?.[0])
	return {
		feePayerAddress,
		feesPaid: feesPaid.toString(),
		numTransactions: result.rows[0]?.[3],
		endingAt: result.rows[0]?.[1],
		startingAt: result.rows[0]?.[2],
	}
}

app.get('/usage', async (c) => {
	const account = privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`)
	const data = await getUsage(account.address)
	return c.json(data)
})

app.all('*', async (c) => {
	const handler = Handler.feePayer({
		account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
		chain: tempo({ feeToken: '0x20c0000000000000000000000000000000000001' }),
		transport: http(env.TEMPO_RPC_URL, {
			fetchOptions: {
				headers: {
					Authorization: `Basic ${btoa(env.TEMPO_RPC_CREDENTIALS)}`,
				},
			},
		}),
		async onRequest(request) {
			console.log(`Sponsoring transaction: ${request.method}`)
		},
	})
	return handler.fetch(c.req.raw)
})

export default app
