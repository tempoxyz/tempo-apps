import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { paymentPayloadSchema } from '../lib/schemas'
import type { SettlementResponse } from '../lib/types'

const settleRoute = new Hono()

settleRoute.post('/', zValidator('json', paymentPayloadSchema), async (c) => {
	const tempoChain = c.get('tempoChain')

	// TODO: Implement settlement logic
	const response: SettlementResponse = {
		success: true,
		transactionHash:
			'0x0000000000000000000000000000000000000000000000000000000000000000',
		network: `eip155:${tempoChain.id}`,
	}
	return c.json(response, 200)
})

export default settleRoute
