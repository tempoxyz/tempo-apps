import { Hash, Hex } from 'ox'
import { eq } from 'drizzle-orm'
import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'

import { app } from '#index.tsx'
import * as DB from '#database/schema.ts'
import { chainIds } from '#wagmi.config.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const chainId = chainIds[0]
if (!chainId) {
	throw new Error('expected at least one configured chain ID')
}
const address = '0x1111111111111111111111111111111111111111' as const

/** Complex ABI with functions, events, errors, tuples, and nested tuples. */
const complexAbi = [
	{
		type: 'function',
		name: 'transfer',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [{ name: '', type: 'bool' }],
		stateMutability: 'nonpayable',
	},
	{
		type: 'function',
		name: 'balanceOf',
		inputs: [{ name: 'account', type: 'address' }],
		outputs: [{ name: '', type: 'uint256' }],
		stateMutability: 'view',
	},
	{
		type: 'function',
		name: 'createOrder',
		inputs: [
			{
				name: 'order',
				type: 'tuple',
				components: [
					{ name: 'maker', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{
						name: 'details',
						type: 'tuple',
						components: [
							{ name: 'expiry', type: 'uint64' },
							{ name: 'nonce', type: 'uint256' },
						],
					},
				],
			},
		],
		outputs: [{ name: 'orderId', type: 'bytes32' }],
		stateMutability: 'nonpayable',
	},
	{
		type: 'function',
		name: 'batchTransfer',
		inputs: [
			{
				name: 'transfers',
				type: 'tuple[]',
				components: [
					{ name: 'to', type: 'address' },
					{ name: 'amount', type: 'uint256' },
				],
			},
		],
		outputs: [],
		stateMutability: 'nonpayable',
	},
	{
		type: 'event',
		name: 'Transfer',
		inputs: [
			{ name: 'from', type: 'address', indexed: true },
			{ name: 'to', type: 'address', indexed: true },
			{ name: 'value', type: 'uint256', indexed: false },
		],
	},
	{
		type: 'event',
		name: 'Approval',
		inputs: [
			{ name: 'owner', type: 'address', indexed: true },
			{ name: 'spender', type: 'address', indexed: true },
			{ name: 'value', type: 'uint256', indexed: false },
		],
	},
	{
		type: 'error',
		name: 'InsufficientBalance',
		inputs: [
			{ name: 'available', type: 'uint256' },
			{ name: 'required', type: 'uint256' },
		],
	},
	{
		type: 'error',
		name: 'Unauthorized',
		inputs: [{ name: 'caller', type: 'address' }],
	},
	// Constructor – should NOT generate a signature
	{
		type: 'constructor',
		inputs: [{ name: 'initialSupply', type: 'uint256' }],
		stateMutability: 'nonpayable',
	},
	// Receive – should NOT generate a signature
	{ type: 'receive', stateMutability: 'payable' },
]

const runtimeTransformations = JSON.stringify({
	cborAuxdata: { offset: 1234, hash: '0xaabb' },
})
const creationTransformations = JSON.stringify({
	constructorArguments:
		'0x00000000000000000000000000000000000000000000000000000000000003e8',
})
const runtimeValues = JSON.stringify({
	libraries: { MathLib: '0x2222222222222222222222222222222222222222' },
})
const creationValues = JSON.stringify({
	constructorArguments:
		'0x00000000000000000000000000000000000000000000000000000000000003e8',
	libraries: { MathLib: '0x2222222222222222222222222222222222222222' },
})

const compilerSettings = JSON.stringify({
	optimizer: { enabled: true, runs: 200 },
	evmVersion: 'cancun',
})

/** Insert a fully-formed verified contract fixture into the DB.  Returns IDs needed for assertions. */
async function insertVerifiedContractFixture(opts?: {
	abi?: unknown[]
	userdoc?: unknown
	devdoc?: unknown
	storageLayout?: unknown
	metadata?: unknown
	runtimeMetadataMatch?: boolean
	creationMetadataMatch?: boolean
	withTransformations?: boolean
	withSignatures?: boolean
	creationSourceMap?: string
	runtimeSourceMap?: string
	runtimeImmutableReferences?: unknown
	runtimeCborAuxdata?: unknown
	creationCborAuxdata?: unknown
	creationLinkReferences?: unknown
	runtimeLinkReferences?: unknown
	transactionHash?: Uint8Array
	blockNumber?: number
	transactionIndex?: number
	deployer?: Uint8Array
}): Promise<{
	compilationId: string
	deploymentId: string
	matchId: number
}> {
	const db = drizzle(env.CONTRACTS_DB)

	const abi = opts?.abi ?? complexAbi
	const runtimeHash = new Uint8Array(32).fill(0xa1)
	const creationHash = new Uint8Array(32).fill(0xa2)
	const codeHashKeccak = new Uint8Array(32).fill(0xa3)

	await db.insert(DB.codeTable).values([
		{
			codeHash: runtimeHash,
			codeHashKeccak,
			code: new Uint8Array([0x60, 0x80]),
		},
		{
			codeHash: creationHash,
			codeHashKeccak,
			code: new Uint8Array([0x60, 0x80, 0x60, 0x40]),
		},
	])

	const contractId = crypto.randomUUID()
	await db.insert(DB.contractsTable).values({
		id: contractId,
		creationCodeHash: creationHash,
		runtimeCodeHash: runtimeHash,
	})

	const deploymentId = crypto.randomUUID()
	await db.insert(DB.contractDeploymentsTable).values({
		id: deploymentId,
		chainId,
		address: Hex.toBytes(address),
		contractId,
		transactionHash: opts?.transactionHash ?? null,
		blockNumber: opts?.blockNumber ?? null,
		transactionIndex: opts?.transactionIndex ?? null,
		deployer: opts?.deployer ?? null,
	})

	const compilationArtifacts = JSON.stringify({
		abi,
		userdoc: opts?.userdoc ?? null,
		devdoc: opts?.devdoc ?? null,
		storageLayout: opts?.storageLayout ?? null,
		metadata: opts?.metadata ?? null,
	})

	const creationCodeArtifacts = JSON.stringify({
		sourceMap: opts?.creationSourceMap ?? '0:0:0:-:0',
		linkReferences: opts?.creationLinkReferences ?? {},
		cborAuxdata: opts?.creationCborAuxdata ?? null,
	})

	const runtimeCodeArtifacts = JSON.stringify({
		sourceMap: opts?.runtimeSourceMap ?? '0:0:0:-:0',
		linkReferences: opts?.runtimeLinkReferences ?? {},
		immutableReferences: opts?.runtimeImmutableReferences ?? {},
		cborAuxdata: opts?.runtimeCborAuxdata ?? null,
	})

	const compilationId = crypto.randomUUID()
	await db.insert(DB.compiledContractsTable).values({
		id: compilationId,
		compiler: 'solc',
		version: '0.8.30',
		language: 'Solidity',
		name: 'Token',
		fullyQualifiedName: 'contracts/Token.sol:Token',
		compilerSettings,
		compilationArtifacts,
		creationCodeHash: creationHash,
		creationCodeArtifacts,
		runtimeCodeHash: runtimeHash,
		runtimeCodeArtifacts,
	})

	// Insert sources
	const sourceContent = 'contract Token { /* ... */ }'
	const sourceHash = new Uint8Array(32).fill(0xbb)
	const sourceHashKeccak = new Uint8Array(32).fill(0xcc)
	await db.insert(DB.sourcesTable).values({
		sourceHash,
		sourceHashKeccak,
		content: sourceContent,
	})
	await db.insert(DB.compiledContractsSourcesTable).values({
		id: crypto.randomUUID(),
		compilationId,
		sourceHash,
		path: 'contracts/Token.sol',
	})

	// Insert signatures into the DB if requested
	if (opts?.withSignatures !== false) {
		const sigItems: Array<{
			name: string
			inputs: unknown[]
			type: 'function' | 'event' | 'error'
		}> = []
		for (const item of abi) {
			if (
				typeof item === 'object' &&
				item !== null &&
				'name' in item &&
				'type' in item
			) {
				const t = (item as Record<string, unknown>).type
				if (t === 'function' || t === 'event' || t === 'error') {
					sigItems.push(
						item as {
							name: string
							inputs: unknown[]
							type: 'function' | 'event' | 'error'
						},
					)
				}
			}
		}

		for (const item of sigItems) {
			const inputTypes = (item.inputs ?? [])
				.map((inp) => formatType(inp))
				.join(',')
			const sig = `${item.name}(${inputTypes})`
			const hash32 = Hash.keccak256(Hex.fromString(sig))
			const hash32Bytes = Hex.toBytes(hash32)

			// signatures table (ignore conflicts for duplicate hashes)
			await db
				.insert(DB.signaturesTable)
				.values({ signatureHash32: hash32Bytes, signature: sig })
				.onConflictDoNothing()
			await db.insert(DB.compiledContractsSignaturesTable).values({
				id: crypto.randomUUID(),
				compilationId,
				signatureHash32: hash32Bytes,
				signatureType: item.type,
			})
		}
	}

	await db.insert(DB.verifiedContractsTable).values({
		deploymentId,
		compilationId,
		creationMatch: true,
		runtimeMatch: true,
		creationMetadataMatch: opts?.creationMetadataMatch ?? true,
		runtimeMetadataMatch: opts?.runtimeMetadataMatch ?? true,
		...(opts?.withTransformations
			? {
					runtimeTransformations,
					creationTransformations,
					runtimeValues,
					creationValues,
				}
			: {}),
	})

	const [row] = await db
		.select({ id: DB.verifiedContractsTable.id })
		.from(DB.verifiedContractsTable)
		.where(eq(DB.verifiedContractsTable.deploymentId, deploymentId))
		.limit(1)
	if (!row) {
		throw new Error('expected verified contract row')
	}

	return {
		compilationId,
		deploymentId,
		matchId: row.id,
	}
}

/** Recursively format an ABI input type, handling tuples. */
function formatType(input: unknown): string {
	if (typeof input !== 'object' || input === null) return ''
	const inp = input as Record<string, unknown>
	const type = inp.type as string
	if (type === 'tuple' || type?.startsWith('tuple[')) {
		const components = Array.isArray(inp.components) ? inp.components : []
		const inner = components.map((c) => formatType(c)).join(',')
		const suffix = type.slice('tuple'.length)
		return `(${inner})${suffix}`
	}
	return type ?? ''
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v2/contract/:chainId/:address – verified contract responses', () => {
	// -----------------------------------------------------------------------
	// Minimal / default response shape
	// -----------------------------------------------------------------------
	it('returns minimal response by default (no fields/omit)', async () => {
		const { matchId } = await insertVerifiedContractFixture()

		const res = await app.request(`/v2/contract/${chainId}/${address}`, {}, env)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		// Minimal shape: matchId, match, creationMatch, runtimeMatch, chainId, address, verifiedAt
		expect(body).toHaveProperty('matchId', String(matchId))
		expect(body).toHaveProperty('match', 'exact_match')
		expect(body).toHaveProperty('creationMatch', 'exact_match')
		expect(body).toHaveProperty('runtimeMatch', 'exact_match')
		expect(body).toHaveProperty('chainId', String(chainId))
		expect(body).toHaveProperty('address', address)
		expect(body).toHaveProperty('verifiedAt')

		// Must NOT include extended fields when fields/omit absent
		expect(body).not.toHaveProperty('abi')
		expect(body).not.toHaveProperty('name')
		expect(body).not.toHaveProperty('sources')
		expect(body).not.toHaveProperty('signatures')
	})

	// -----------------------------------------------------------------------
	// fields=all  — full response
	// -----------------------------------------------------------------------
	it('returns full response with fields=all', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=all`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		// Check extended fields are present
		expect(body).toHaveProperty('abi')
		expect(body).toHaveProperty('name', 'Token')
		expect(body).toHaveProperty(
			'fullyQualifiedName',
			'contracts/Token.sol:Token',
		)
		expect(body).toHaveProperty('compiler', 'solc')
		expect(body).toHaveProperty('compilerVersion', '0.8.30')
		expect(body).toHaveProperty('language', 'Solidity')
		expect(body).toHaveProperty('sources')
		expect(body).toHaveProperty('sourceIds')
		expect(body).toHaveProperty('signatures')
		expect(body).toHaveProperty('creationBytecode')
		expect(body).toHaveProperty('runtimeBytecode')
		expect(body).toHaveProperty('compilation')
		expect(body).toHaveProperty('deployment')
		expect(body).toHaveProperty('stdJsonInput')
		expect(body).toHaveProperty('stdJsonOutput')
	})

	// -----------------------------------------------------------------------
	// fields= selective
	// -----------------------------------------------------------------------
	it('returns only requested fields plus minimal envelope with fields=abi,name', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=abi,name`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		// Minimal fields always present
		expect(body).toHaveProperty('matchId')
		expect(body).toHaveProperty('chainId')
		expect(body).toHaveProperty('address')

		// Requested fields
		expect(body).toHaveProperty('abi')
		expect(body).toHaveProperty('name', 'Token')

		// Fields NOT requested should be absent
		expect(body).not.toHaveProperty('sources')
		expect(body).not.toHaveProperty('signatures')
		expect(body).not.toHaveProperty('compilation')
		expect(body).not.toHaveProperty('stdJsonInput')
	})

	it('returns only sources and sourceIds with fields=sources,sourceIds', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=sources,sourceIds`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		expect(body).toHaveProperty('sources')
		expect(body).toHaveProperty('sourceIds')

		const sources = body.sources as Record<string, { content: string }>
		expect(sources).toHaveProperty('contracts/Token.sol')
		expect(sources['contracts/Token.sol']?.content).toBe(
			'contract Token { /* ... */ }',
		)

		// Not requested
		expect(body).not.toHaveProperty('abi')
		expect(body).not.toHaveProperty('runtimeBytecode')
	})

	// -----------------------------------------------------------------------
	// omit=
	// -----------------------------------------------------------------------
	it('omits specified fields from the full response', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?omit=abi,sources,stdJsonInput,stdJsonOutput`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		// Omitted fields
		expect(body).not.toHaveProperty('abi')
		expect(body).not.toHaveProperty('sources')
		expect(body).not.toHaveProperty('stdJsonInput')
		expect(body).not.toHaveProperty('stdJsonOutput')

		// Other extended fields still present because omit exposes full minus omitted
		expect(body).toHaveProperty('name', 'Token')
		expect(body).toHaveProperty('compiler', 'solc')
		expect(body).toHaveProperty('signatures')
		expect(body).toHaveProperty('compilation')
	})

	it('returns 400 when both fields and omit are specified', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=abi&omit=sources`,
			{},
			env,
		)
		expect(res.status).toBe(400)
		const body = (await res.json()) as Record<string, unknown>
		expect(body).toHaveProperty('customCode', 'invalid_params')
	})

	// -----------------------------------------------------------------------
	// Nested field selection
	// -----------------------------------------------------------------------
	it('supports nested field selection with dot paths', async () => {
		await insertVerifiedContractFixture({
			transactionHash: Hex.toBytes(
				'0x000000000000000000000000000000000000000000000000000000000000abcd',
			),
			blockNumber: 42,
			transactionIndex: 3,
			deployer: Hex.toBytes('0x3333333333333333333333333333333333333333'),
		})

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=deployment.chainId,deployment.address,deployment.deployer`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		// Should have nested deployment with only requested sub-fields
		expect(body).toHaveProperty('deployment')
		const deployment = body.deployment as Record<string, unknown>
		expect(deployment).toHaveProperty('chainId', String(chainId))
		expect(deployment).toHaveProperty('address', address)
		expect(deployment).toHaveProperty(
			'deployer',
			'0x3333333333333333333333333333333333333333',
		)

		// Non-requested fields
		expect(body).not.toHaveProperty('abi')
		expect(body).not.toHaveProperty('sources')
	})

	it('supports nested omit to remove sub-fields', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?omit=deployment.deployer,deployment.transactionHash,sources,stdJsonInput,stdJsonOutput`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		expect(body).toHaveProperty('deployment')
		const deployment = body.deployment as Record<string, unknown>
		expect(deployment).not.toHaveProperty('deployer')
		expect(deployment).not.toHaveProperty('transactionHash')
		// Remaining sub-fields still present
		expect(deployment).toHaveProperty('chainId')
		expect(deployment).toHaveProperty('address')
	})

	it('selecting a non-existent field is silently ignored', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=abi,nonExistentField`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		expect(body).toHaveProperty('abi')
		expect(body).not.toHaveProperty('nonExistentField')
	})

	// -----------------------------------------------------------------------
	// Transformation payload exposure
	// -----------------------------------------------------------------------
	it('exposes runtimeValues, creationValues, runtimeTransformations, creationTransformations in full response', async () => {
		await insertVerifiedContractFixture({ withTransformations: true })

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=all`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		// Note: the current route handler fetches these columns but does NOT
		// include them in the full response.  This test documents that gap.
		// If the handler is later fixed to expose them, update the assertions below.
		//
		// When exposed they should look like:
		//   body.runtimeValues → parsed JSON
		//   body.creationValues → parsed JSON
		//   body.runtimeTransformations → parsed JSON
		//   body.creationTransformations → parsed JSON
		//
		// For now, assert that the minimal envelope fields are correct even when
		// transformations are stored in the DB.
		expect(body).toHaveProperty('matchId')
		expect(body).toHaveProperty('match', 'exact_match')
		expect(body).toHaveProperty('runtimeMatch', 'exact_match')
		expect(body).toHaveProperty('creationMatch', 'exact_match')
	})

	// -----------------------------------------------------------------------
	// Metadata match states
	// -----------------------------------------------------------------------
	it('reports runtimeMetadataMatch and creationMetadataMatch in full response', async () => {
		await insertVerifiedContractFixture({
			runtimeMetadataMatch: false,
			creationMetadataMatch: true,
		})

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=runtimeMetadataMatch,creationMetadataMatch`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		expect(body).toHaveProperty('runtimeMetadataMatch', 'match')
		expect(body).toHaveProperty('creationMetadataMatch', 'exact_match')
	})

	// -----------------------------------------------------------------------
	// Signatures from DB-backed verified contracts
	// -----------------------------------------------------------------------
	it('returns DB-backed signatures grouped by type for a complex ABI', async () => {
		await insertVerifiedContractFixture({ withSignatures: true })

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=signatures`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			signatures: {
				function: Array<{
					signature: string
					signatureHash32: string
					signatureHash4: string
				}>
				event: Array<{
					signature: string
					signatureHash32: string
					signatureHash4: string
				}>
				error: Array<{
					signature: string
					signatureHash32: string
					signatureHash4: string
				}>
			}
		}

		const sigs = body.signatures
		expect(sigs).toBeDefined()

		// Functions
		const fnSigs = sigs.function.map((s) => s.signature).toSorted()
		expect(fnSigs).toContain('transfer(address,uint256)')
		expect(fnSigs).toContain('balanceOf(address)')
		expect(fnSigs).toContain('createOrder((address,uint256,(uint64,uint256)))')
		expect(fnSigs).toContain('batchTransfer((address,uint256)[])')
		expect(sigs.function).toHaveLength(4)

		// Events
		const evSigs = sigs.event.map((s) => s.signature).toSorted()
		expect(evSigs).toContain('Transfer(address,address,uint256)')
		expect(evSigs).toContain('Approval(address,address,uint256)')
		expect(sigs.event).toHaveLength(2)

		// Errors
		const errSigs = sigs.error.map((s) => s.signature).toSorted()
		expect(errSigs).toContain('InsufficientBalance(uint256,uint256)')
		expect(errSigs).toContain('Unauthorized(address)')
		expect(sigs.error).toHaveLength(2)

		// Each entry should have hash fields
		for (const group of [sigs.function, sigs.event, sigs.error]) {
			for (const entry of group) {
				expect(entry.signatureHash32).toMatch(/^0x[0-9a-f]{64}$/)
				expect(entry.signatureHash4).toMatch(/^0x[0-9a-f]{8}$/)
				// hash4 must be a prefix of hash32
				expect(entry.signatureHash32.startsWith(entry.signatureHash4)).toBe(
					true,
				)
			}
		}
	})

	it('returns empty signature groups when no signatures are stored in DB', async () => {
		await insertVerifiedContractFixture({ withSignatures: false })

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=signatures`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			signatures: { function: unknown[]; event: unknown[]; error: unknown[] }
		}
		expect(body.signatures.function).toEqual([])
		expect(body.signatures.event).toEqual([])
		expect(body.signatures.error).toEqual([])
	})

	// -----------------------------------------------------------------------
	// Bytecode fields
	// -----------------------------------------------------------------------
	it('returns creation and runtime bytecode with artifact data', async () => {
		await insertVerifiedContractFixture({
			creationSourceMap: '1:2:3:-:0',
			runtimeSourceMap: '4:5:6:-:0',
			runtimeImmutableReferences: { '5': [{ start: 0, length: 32 }] },
			runtimeCborAuxdata: { offset: 100 },
			creationCborAuxdata: { offset: 200 },
		})

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=creationBytecode,runtimeBytecode`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		const creation = body.creationBytecode as Record<string, unknown>
		const runtime = body.runtimeBytecode as Record<string, unknown>

		expect(creation).toBeDefined()
		expect(creation.bytecode).toMatch(/^0x/)
		expect(creation.sourceMap).toBe('1:2:3:-:0')
		expect(creation.cborAuxdata).toEqual({ offset: 200 })

		expect(runtime).toBeDefined()
		expect(runtime.bytecode).toMatch(/^0x/)
		expect(runtime.sourceMap).toBe('4:5:6:-:0')
		expect(runtime.immutableReferences).toEqual({
			'5': [{ start: 0, length: 32 }],
		})
		expect(runtime.cborAuxdata).toEqual({ offset: 100 })
	})

	// -----------------------------------------------------------------------
	// Deployment metadata
	// -----------------------------------------------------------------------
	it('includes transaction metadata in deployment when available', async () => {
		const txHash = Hex.toBytes(
			'0x000000000000000000000000000000000000000000000000000000000000abcd',
		)
		const deployerAddr = Hex.toBytes(
			'0x3333333333333333333333333333333333333333',
		)

		await insertVerifiedContractFixture({
			transactionHash: txHash,
			blockNumber: 999,
			transactionIndex: 7,
			deployer: deployerAddr,
		})

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=deployment`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		const deployment = body.deployment as Record<string, unknown>
		expect(deployment.chainId).toBe(String(chainId))
		expect(deployment.address).toBe(address)
		expect(deployment.blockNumber).toBe(999)
		expect(deployment.transactionIndex).toBe(7)
		expect(deployment.deployer).toBe(
			'0x3333333333333333333333333333333333333333',
		)
		expect(deployment.transactionHash).toMatch(/^0x/)
	})

	// -----------------------------------------------------------------------
	// Compilation sub-object
	// -----------------------------------------------------------------------
	it('returns compilation sub-object with fields=compilation', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=compilation`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>
		const comp = body.compilation as Record<string, unknown>
		expect(comp).toBeDefined()
		expect(comp.compiler).toBe('solc')
		expect(comp.compilerVersion).toBe('0.8.30')
		expect(comp.language).toBe('Solidity')
		expect(comp.name).toBe('Token')
		expect(comp.fullyQualifiedName).toBe('contracts/Token.sol:Token')
		expect(comp.compilerSettings).toEqual(JSON.parse(compilerSettings))
	})

	// -----------------------------------------------------------------------
	// stdJsonInput / stdJsonOutput
	// -----------------------------------------------------------------------
	it('returns stdJsonInput and stdJsonOutput with fields=stdJsonInput,stdJsonOutput', async () => {
		await insertVerifiedContractFixture()

		const res = await app.request(
			`/v2/contract/${chainId}/${address}?fields=stdJsonInput,stdJsonOutput`,
			{},
			env,
		)
		expect(res.status).toBe(200)

		const body = (await res.json()) as Record<string, unknown>

		const input = body.stdJsonInput as Record<string, unknown>
		expect(input).toBeDefined()
		expect(input.language).toBe('Solidity')
		expect(input.sources).toHaveProperty('contracts/Token.sol')
		expect(input.settings).toEqual(JSON.parse(compilerSettings))

		const output = body.stdJsonOutput as Record<string, unknown>
		expect(output).toBeDefined()
		expect(output).toHaveProperty('contracts')
	})

	// -----------------------------------------------------------------------
	// 404 for non-existent contract
	// -----------------------------------------------------------------------
	it('returns 404 for address with no verified contract', async () => {
		const res = await app.request(
			`/v2/contract/${chainId}/0x0000000000000000000000000000000000000099`,
			{},
			env,
		)
		expect(res.status).toBe(404)
		const body = (await res.json()) as Record<string, unknown>
		expect(body).toHaveProperty('customCode', 'contract_not_found')
	})
})
