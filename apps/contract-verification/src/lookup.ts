import { Hono } from 'hono'

/**
 * GET /v2/contract/{chainId}/{address}
 * GET /v2/contract/all-chains/{address}
 * GET /v2/contracts/{chainId}
 */

const lookupApp = new Hono<{ Bindings: Cloudflare.Env }>()

// GET /v2/contract/all-chains/:address - Get verified contract at an address on all chains
// Note: This route must be defined before /:chainId/:address to avoid matching conflicts
lookupApp.get('/all-chains/:address', async (context) => {
	const { address } = context.req.param()

	// Validate address format
	if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
		return context.json(
			{
				customCode: 'invalid_address',
				message: `Invalid address format: ${address}`,
				errorId: crypto.randomUUID(),
			},
			400,
		)
	}

	// TODO: Lookup contract verification status across all chains in database
	// For now, return empty results
	return context.json({
		results: [],
	})
})

// GET /v2/contract/:chainId/:address - Get verified contract
lookupApp.get('/:chainId/:address', async (context) => {
	const { chainId, address } = context.req.param()
	const { fields, omit } = context.req.query()

	// Validate chainId format
	if (!/^\d+$/.test(chainId)) {
		return context.json(
			{
				customCode: 'invalid_chain_id',
				message: `Invalid chainId format: ${chainId}`,
				errorId: crypto.randomUUID(),
			},
			400,
		)
	}

	// Validate address format
	if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
		return context.json(
			{
				customCode: 'invalid_address',
				message: `Invalid address format: ${address}`,
				errorId: crypto.randomUUID(),
			},
			400,
		)
	}

	// fields and omit are mutually exclusive
	if (fields && omit) {
		return context.json(
			{
				customCode: 'invalid_query_params',
				message:
					'Cannot use both fields and omit query parameters simultaneously',
				errorId: crypto.randomUUID(),
			},
			400,
		)
	}

	// TODO: Lookup contract verification status in database
	// For now, return 404 as contract not found
	return context.json(
		{
			customCode: 'contract_not_found',
			message: `Contract ${address} on chain ${chainId} not found`,
			errorId: crypto.randomUUID(),
		},
		404,
	)
})

export { lookupApp }
