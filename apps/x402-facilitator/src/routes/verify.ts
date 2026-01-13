import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { paymentPayloadSchema } from '../lib/schemas'
import type { VerifyResponse } from '../lib/types'

const verifyRoute = new Hono()

verifyRoute.post('/', zValidator('json', paymentPayloadSchema), async (c) => {
	// TODO: Implement verification logic
	const response: VerifyResponse = { success: true }
	return c.json(response, 200)
})

export default verifyRoute
