import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Address } from 'viem'
import { isAddress } from 'viem'
import * as z from 'zod'
import {
	confirmDispensation,
	createPendingDispensation,
	failDispensation,
	getDailyTotal,
	getDispensations,
} from './lib/db.js'
import { dispenseFunds, getFaucetBalance } from './lib/faucet.js'
import type { OktaUser } from './lib/okta.js'
import { oktaAuth } from './lib/okta.js'

const MAX_DISPENSE_AMOUNT = 10
const DAILY_LIMIT = 50

type AppEnv = {
	Variables: { user: OktaUser }
}

const app = new Hono<AppEnv>()

app.use(
	'*',
	cors({
		origin: ['https://admin.tempo.xyz'],
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	}),
)

app.use('/api/*', oktaAuth)

app.get('/health', (c) => c.json({ status: 'ok' }))

const amountRegex = /^\d+(\.\d{1,18})?$/

app.post(
	'/api/faucet/dispense',
	zValidator(
		'json',
		z.object({
			recipient: z.string().refine((v) => isAddress(v), 'Invalid address'),
			amount: z
				.string()
				.refine((v) => amountRegex.test(v), 'Invalid amount format')
				.refine(
					(v) => Number(v) > 0 && Number(v) <= MAX_DISPENSE_AMOUNT,
					`Amount must be between 0 and ${MAX_DISPENSE_AMOUNT}`,
				),
			purpose: z
				.string()
				.min(1, 'Purpose is required')
				.max(500, 'Purpose must be 500 characters or less'),
		}),
	),
	async (c) => {
		const { recipient, amount, purpose } = c.req.valid('json')
		const user = c.get('user')

		const dailyTotal = await getDailyTotal(user.email)
		if (dailyTotal + Number(amount) > DAILY_LIMIT) {
			return c.json(
				{
					error: `Daily limit of ${DAILY_LIMIT} TEMPO exceeded. Used today: ${dailyTotal}`,
				},
				429,
			)
		}

		const record = await createPendingDispensation({
			email: user.email,
			recipient,
			amount,
			purpose,
		})

		try {
			const txHash = await dispenseFunds({
				recipient: recipient as Address,
				amount,
			})

			await confirmDispensation(record.id, txHash)

			return c.json({ ...record, tx_hash: txHash, status: 'confirmed' }, 201)
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Transaction failed'
			await failDispensation(record.id, message)
			return c.json({ error: message }, 500)
		}
	},
)

app.get(
	'/api/faucet/history',
	zValidator(
		'query',
		z.object({
			limit: z.optional(z.coerce.number().int().min(1).max(100)),
			offset: z.optional(z.coerce.number().int().min(0)),
		}),
	),
	async (c) => {
		const { limit, offset } = c.req.valid('query')
		const user = c.get('user')
		const dispensations = await getDispensations({
			email: user.email,
			limit,
			offset,
		})
		return c.json(dispensations)
	},
)

app.get('/api/faucet/balance', async (c) => {
	const balance = await getFaucetBalance()
	return c.json({ balance })
})

export default app
