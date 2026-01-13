import { Hono } from 'hono'
import type { PaymentRequirements } from '../lib/types'

const requirementsRoute = new Hono()

requirementsRoute.get('/', (c) => {
	const tempoChain = c.get('tempoChain')

	// Static requirements
	const requirements: PaymentRequirements = {
		scheme: 'exact',
		network: `eip155:${tempoChain.id}`,
		amount: '10000',
		asset: '0x20c0000000000000000000000000000000000001', // alphaUSD
		payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
		maxTimeoutSeconds: 60,
		extra: {
			name: 'alphaUSD',
			decimals: 6,
		},
	}

	return c.json({
		x402Version: 2,
		resource: {
			url: c.req.url,
			description: 'Access to protected resource',
			mimeType: 'application/json',
		},
		accepted: requirements,
	})
})

export default requirementsRoute
