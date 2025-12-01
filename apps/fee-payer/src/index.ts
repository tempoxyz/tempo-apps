import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Address } from 'ox'
import { tempo } from 'tempo.ts/chains'
import { Handler } from 'tempo.ts/server'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import * as z from 'zod/mini'
import { runQuery, toBigInt } from './lib/index-supply'

const app = new Hono()

const BlockTimestampFilterSchema = z.object({
	gt: z.optional(z.coerce.number().check(z.gte(0))),
	gte: z.optional(z.coerce.number().check(z.gte(0))),
	lt: z.optional(z.coerce.number().check(z.gte(0))),
	lte: z.optional(z.coerce.number().check(z.gte(0))),
})

const UsageQuerySchema = z.object({
	block_timestamp: z.optional(BlockTimestampFilterSchema),
})

type UsageQuery = z.infer<typeof UsageQuerySchema>
type BlockTimestampFilter = z.infer<typeof BlockTimestampFilterSchema>

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

function epochToTimestamp(epoch: number): string {
	const date = new Date(epoch * 1000)
	return date.toISOString().replace('T', ' ').substring(0, 19)
}

async function getUsage(
	feePayerAddress: Address.Address,
	blockTimestampFilter?: BlockTimestampFilter,
) {
	const whereConditions = [
		`"from" = '${feePayerAddress}'`,
		`"to" = '${FEE_MANAGER_CONTRACT}'`,
	]

	if (blockTimestampFilter) {
		const operators = {
			gt: '>',
			gte: '>=',
			lt: '<',
			lte: '<=',
		} as const

		for (const [key, operator] of Object.entries(operators)) {
			const value = blockTimestampFilter[key as keyof BlockTimestampFilter]
			if (value !== undefined) {
				const ts = epochToTimestamp(value)
				whereConditions.push(`block_timestamp::timestamp ${operator} '${ts}'`)
			}
		}
	}

	const whereClause = whereConditions.join('\n\t\t\t\tand ')

	const query = `
		select
			sum(amount) as total_spent,
			max(block_timestamp) as ending_at,
			min(block_timestamp) as starting_at,
			count(tx_hash) as n_transactions
		from
			transfer
		where
			${whereClause}
		`

	console.log('IndexSupply Query:', query)

	const result = await runQuery(query, { signatures: [TRANSFER_SIGNATURE] })
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
	const rawQuery = c.req.query()
	const blockTimestamp: Record<string, string> = {}

	for (const [key, value] of Object.entries(rawQuery)) {
		const match = key.match(/^block_timestamp\[(\w+)\]$/)
		if (match && match[1]) {
			blockTimestamp[match[1]] = value
		}
	}

	const queryInput = {
		block_timestamp:
			Object.keys(blockTimestamp).length > 0 ? blockTimestamp : undefined,
	}

	const validation = UsageQuerySchema.safeParse(queryInput)

	if (!validation.success) {
		return c.json(
			{
				error: 'Invalid query parameters',
				details: z.prettifyError(validation.error),
			},
			400,
		)
	}

	const validatedQuery = validation.data
	const account = privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`)
	const data = await getUsage(account.address, validatedQuery.block_timestamp)

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
