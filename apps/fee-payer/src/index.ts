import { env } from 'cloudflare:workers'
import type { Address } from 'ox'
import { tempo } from 'tempo.ts/chains'
import { Handler } from 'tempo.ts/server'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { runQuery, toBigInt } from './lib/index-supply'

const headers = new Headers({
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Max-Age': '86400',
})

const FEE_MANAGER_CONTRACT = '0xfeec000000000000000000000000000000000000'
const TRANSFER_SIGNATURE =
	'Transfer(address indexed from, address indexed to, uint256 amount)'

async function handleUsage(feePayerAddress: Address.Address) {
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
		feePayerAddress: feePayerAddress,
		feesPaid: feesPaid.toString(),
		numTransactions: result.rows[0]?.[3],
		endingAt: result.rows[0]?.[1],
		startingAt: result.rows[0]?.[2],
	}
}

export default {
	async fetch(request) {
		const origin = request.headers.get('origin')
		if (env.ALLOWED_ORIGINS === '*')
			headers.set('Access-Control-Allow-Origin', '*')
		else if (origin && env.ALLOWED_ORIGINS.includes(origin))
			headers.set('Access-Control-Allow-Origin', origin)

		const url = new URL(request.url)

		// todo(struong): use a route handler instead of conditionals
		if (request.method === 'GET' && url.pathname === '/usage') {
			const account = privateKeyToAccount(
				env.SPONSOR_PRIVATE_KEY as `0x${string}`,
			)
			const data = await handleUsage(account.address)
			return Response.json(data, { headers })
		}

		return await Handler.feePayer({
			account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
			chain: tempo({ feeToken: '0x20c0000000000000000000000000000000000001' }),
			headers,
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
		}).fetch(request)
	},
} satisfies ExportedHandler<Env>
