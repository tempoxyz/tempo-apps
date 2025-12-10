import crypto from 'node:crypto'
import { Hono } from 'hono'

/**
 * /verify:
 *
 * POST /v2/verify/{chainId}/{address}
 * POST /v2/verify/metadata/{chainId}/{address}
 * POST /v2/verify/similarity/{chainId}/{address}
 * GET  /v2/verify/{verificationId}
 *
 * (deprecated ones but still supported by foundry forge):
 *
 * POST /verify
 * POST /verify/vyper
 * POST /verify/etherscan
 * POST /verify/solc-json
 */

const verifyApp = new Hono<{ Bindings: Cloudflare.Env }>()

// POST /v2/verify/:chainId/:address - Verify Contract (Standard JSON)
verifyApp.post('/:chainId/:address', async (context) => {
	const { chainId, address } = context.req.param()
	const body = await context.req.json()

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

	// Validate required fields
	const { stdJsonInput, compilerVersion, contractIdentifier } = body
	if (!stdJsonInput || !compilerVersion || !contractIdentifier) {
		return context.json(
			{
				customCode: 'missing_required_fields',
				message:
					'Missing required fields: stdJsonInput, compilerVersion, and contractIdentifier are required',
				errorId: crypto.randomUUID(),
			},
			400,
		)
	}

	const verificationId = crypto.randomUUID()

	// TODO: Start verification job in background
	// TODO: Store job status in database

	return context.json({ verificationId }, 202)
})

// POST /v2/verify/metadata/:chainId/:address - Verify Contract (using Solidity metadata.json)
verifyApp.post('/metadata/:chainId/:address', async (context) => {
	const { chainId, address } = context.req.param()
	const body = await context.req.json()

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

	// Validate required fields
	const { sources, metadata } = body
	if (!sources || !metadata) {
		return context.json(
			{
				customCode: 'missing_required_fields',
				message: 'Missing required fields: sources and metadata are required',
				errorId: crypto.randomUUID(),
			},
			400,
		)
	}

	const verificationId = crypto.randomUUID()

	// TODO: Start verification job in background
	// TODO: Store job status in database

	return context.json({ verificationId }, 202)
})

// POST /v2/verify/similarity/:chainId/:address - Verify contract via similarity search
verifyApp.post('/similarity/:chainId/:address', async (context) => {
	const { chainId, address } = context.req.param()
	// Body is optional, may contain creationTransactionHash
	const _body = await context.req.json().catch(() => ({}))

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

	const verificationId = crypto.randomUUID()

	// TODO: Start similarity search verification job in background
	// TODO: Store job status in database

	return context.json({ verificationId }, 202)
})

// GET /v2/verify/:verificationId - Check verification job status
verifyApp.get('/:verificationId', async (context) => {
	const { verificationId } = context.req.param()

	// Validate UUID format
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			verificationId,
		)
	) {
		return context.json(
			{
				customCode: 'invalid_verification_id',
				message: `Invalid verificationId format: ${verificationId}`,
				errorId: crypto.randomUUID(),
			},
			400,
		)
	}

	// TODO: Lookup job status in database
	// For now, return a mock pending response
	return context.json({
		isJobCompleted: false,
		verificationId,
		jobStartTime: new Date().toISOString(),
		contract: {
			match: null,
			creationMatch: null,
			runtimeMatch: null,
			chainId: '0',
			address: '0x0000000000000000000000000000000000000000',
		},
	})
})

export { verifyApp }
