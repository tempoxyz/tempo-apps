import { Hono } from 'hono'
import { Address, Hex } from 'ox'
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm'
import { keccak256 } from 'viem'

import {
	codeTable,
	sourcesTable,
	signaturesTable,
	nativeContractsTable,
	verifiedContractsTable,
	compiledContractsTable,
	contractDeploymentsTable,
	nativeContractRevisionsTable,
	compiledContractsSourcesTable,
	compiledContractsSignaturesTable,
	nativeContractRevisionSourcesTable,
} from '#database/schema.ts'
import { getLogger } from '#lib/logger.ts'
import { chainIds } from '#wagmi.config.ts'
import { formatError, getDb, sourcifyError } from '#lib/utilities.ts'

const logger = getLogger(['tempo'])

type MinimalLookupResponse = {
	matchId: string | null
	match: 'match' | 'exact_match' | null
	creationMatch: 'match' | 'exact_match' | null
	runtimeMatch: 'match' | 'exact_match' | null
	chainId: string
	address: string
	verifiedAt: string | null
}

type SignaturesPayload = {
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

type MatchCursor =
	| { kind: 'verified'; value: number }
	| { kind: 'native'; value: string }

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
	return Hex.fromBytes(
		bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
	)
}

function parseMatchCursor(matchId?: string): MatchCursor | null {
	if (!matchId) return null

	if (matchId.startsWith('native:')) {
		const value = matchId.slice('native:'.length)
		return value ? { kind: 'native', value } : null
	}

	const value = Number(matchId)
	if (!Number.isSafeInteger(value) || value <= 0) return null

	return { kind: 'verified', value }
}

function formatAbiParameterType(parameter: unknown): string | null {
	if (!isRecord(parameter) || typeof parameter.type !== 'string') return null

	if (parameter.type === 'tuple' || parameter.type.startsWith('tuple[')) {
		const components = Array.isArray(parameter.components)
			? parameter.components
			: []
		const componentTypes = components
			.map((component) => formatAbiParameterType(component))
			.filter((type): type is string => type !== null)
		const suffix = parameter.type.slice('tuple'.length)
		return `(${componentTypes.join(',')})${suffix}`
	}

	return parameter.type
}

function buildSignaturesPayload(abi: unknown): SignaturesPayload {
	const signatures: SignaturesPayload = {
		function: [],
		event: [],
		error: [],
	}

	if (!Array.isArray(abi)) return signatures

	for (const item of abi) {
		if (!isRecord(item) || typeof item.name !== 'string') continue
		if (
			item.type !== 'function' &&
			item.type !== 'event' &&
			item.type !== 'error'
		) {
			continue
		}

		const inputs = Array.isArray(item.inputs) ? item.inputs : []
		const inputTypes = inputs
			.map((input) => formatAbiParameterType(input))
			.filter((type): type is string => type !== null)
			.join(',')
		const signature = `${item.name}(${inputTypes})`
		const signatureHash32 = keccak256(Hex.fromString(signature))
		const signatureHash4 = Hex.fromBytes(
			Hex.toBytes(signatureHash32).slice(0, 4),
		)

		signatures[item.type].push({
			signature,
			signatureHash32,
			signatureHash4,
		})
	}

	return signatures
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNestedValue(
	source: Record<string, unknown>,
	path: string,
): { found: boolean; value?: unknown } {
	const keys = path.split('.').filter(Boolean)
	let current: unknown = source

	for (const key of keys) {
		if (!isRecord(current) || !(key in current)) {
			return { found: false }
		}
		current = current[key]
	}

	return { found: true, value: current }
}

function setNestedValue(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	const keys = path.split('.').filter(Boolean)
	if (keys.length === 0) return

	let current = target
	for (const key of keys.slice(0, -1)) {
		const nextValue = current[key]
		if (!isRecord(nextValue)) {
			current[key] = {}
		}
		current = current[key] as Record<string, unknown>
	}

	const finalKey = keys.at(-1)
	if (!finalKey) return
	current[finalKey] = value
}

function deleteNestedValue(
	target: Record<string, unknown>,
	path: string,
): void {
	const keys = path.split('.').filter(Boolean)
	if (keys.length === 0) return

	const deleteAt = (
		current: Record<string, unknown>,
		remaining: string[],
	): void => {
		const [key, ...rest] = remaining
		if (!key || !(key in current)) return

		if (rest.length === 0) {
			delete current[key]
			return
		}

		const nextValue = current[key]
		if (!isRecord(nextValue)) return

		deleteAt(nextValue, rest)
		if (Object.keys(nextValue).length === 0) {
			delete current[key]
		}
	}

	deleteAt(target, keys)
}

function applyFieldSelection(
	fullResponse: Record<string, unknown>,
	minimalResponse: MinimalLookupResponse,
	fields?: string,
	omit?: string,
): Record<string, unknown> {
	if (fields) {
		if (fields === 'all') return fullResponse

		const filtered: Record<string, unknown> = { ...minimalResponse }
		for (const field of fields
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)) {
			const nestedValue = getNestedValue(fullResponse, field)
			if (nestedValue.found) {
				setNestedValue(filtered, field, nestedValue.value)
			}
		}

		return filtered
	}

	if (omit) {
		const filtered = structuredClone(fullResponse) as Record<string, unknown>
		for (const field of omit
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)) {
			deleteNestedValue(filtered, field)
		}

		return filtered
	}

	return minimalResponse
}

function buildVerifiedMinimalResponse(row: {
	matchId: number
	runtimeMatch: boolean
	creationMatch: boolean
	chainId: number
	address: ArrayBuffer
	verifiedAt: string
}): MinimalLookupResponse {
	const runtimeMatchStatus = row.runtimeMatch ? 'exact_match' : 'match'
	const creationMatchStatus = row.creationMatch ? 'exact_match' : 'match'
	const matchStatus =
		runtimeMatchStatus === 'exact_match' ||
		creationMatchStatus === 'exact_match'
			? 'exact_match'
			: runtimeMatchStatus || creationMatchStatus

	return {
		matchId: String(row.matchId),
		match: matchStatus,
		creationMatch: creationMatchStatus,
		runtimeMatch: runtimeMatchStatus,
		chainId: String(row.chainId),
		address: bytesToHex(row.address),
		verifiedAt: row.verifiedAt,
	}
}

function buildNativeMinimalResponse(row: {
	id: string
	chainId: number
	address: ArrayBuffer
}): MinimalLookupResponse {
	return {
		matchId: `native:${row.id}`,
		match: 'exact_match',
		creationMatch: 'exact_match',
		runtimeMatch: 'exact_match',
		chainId: String(row.chainId),
		address: bytesToHex(row.address),
		verifiedAt: null,
	}
}

function buildSourcesPayload(
	sourcesResult: Array<{
		path: string
		content: string
		sourceHash: ArrayBuffer
	}>,
): {
	sources: Record<string, { content: string }>
	sourceIds: Record<string, string>
	paths: string[]
} {
	const sources: Record<string, { content: string }> = {}
	const sourceIds: Record<string, string> = {}
	const seenContentHashes = new Set<string>()
	const paths: string[] = []

	const sortedSources = [...sourcesResult].toSorted((a, b) => {
		const aIsAbsolute = a.path.startsWith('/')
		const bIsAbsolute = b.path.startsWith('/')
		if (aIsAbsolute !== bIsAbsolute) return aIsAbsolute ? 1 : -1
		return 0
	})

	for (const source of sortedSources) {
		const hashHex = bytesToHex(source.sourceHash)
		if (seenContentHashes.has(hashHex)) continue
		seenContentHashes.add(hashHex)

		sources[source.path] = { content: source.content }
		sourceIds[source.path] = hashHex
		paths.push(source.path)
	}

	return { sources, sourceIds, paths }
}

async function getNativeLookupResponse(
	db: ReturnType<typeof getDb>,
	chainIdNumber: number,
	addressBytes: Uint8Array,
): Promise<{
	minimalResponse: MinimalLookupResponse
	fullResponse: Record<string, unknown>
} | null> {
	const [nativeContract] = await db
		.select({
			id: nativeContractsTable.id,
			chainId: nativeContractsTable.chainId,
			address: nativeContractsTable.address,
			name: nativeContractsTable.name,
			runtimeType: nativeContractsTable.runtimeType,
			language: nativeContractsTable.language,
			abiJson: nativeContractsTable.abiJson,
			docsUrl: nativeContractsTable.docsUrl,
		})
		.from(nativeContractsTable)
		.where(
			and(
				eq(nativeContractsTable.chainId, chainIdNumber),
				eq(nativeContractsTable.address, addressBytes),
			),
		)
		.limit(1)

	if (!nativeContract) return null

	const [revision] = await db
		.select({
			id: nativeContractRevisionsTable.id,
			repo: nativeContractRevisionsTable.repo,
			commitSha: nativeContractRevisionsTable.commitSha,
			commitUrl: nativeContractRevisionsTable.commitUrl,
			protocolVersion: nativeContractRevisionsTable.protocolVersion,
			fromBlock: nativeContractRevisionsTable.fromBlock,
			toBlock: nativeContractRevisionsTable.toBlock,
		})
		.from(nativeContractRevisionsTable)
		.where(eq(nativeContractRevisionsTable.nativeContractId, nativeContract.id))
		.orderBy(desc(nativeContractRevisionsTable.fromBlock))
		.limit(1)

	if (!revision) return null

	const revisionSources = await db
		.select({
			path: nativeContractRevisionSourcesTable.path,
			isEntrypoint: nativeContractRevisionSourcesTable.isEntrypoint,
			content: sourcesTable.content,
			sourceHash: sourcesTable.sourceHash,
		})
		.from(nativeContractRevisionSourcesTable)
		.innerJoin(
			sourcesTable,
			eq(
				nativeContractRevisionSourcesTable.sourceHash,
				sourcesTable.sourceHash,
			),
		)
		.where(eq(nativeContractRevisionSourcesTable.revisionId, revision.id))

	const { sources, sourceIds } = buildSourcesPayload(
		revisionSources.map((source) => ({
			path: source.path,
			content: source.content,
			sourceHash: source.sourceHash as ArrayBuffer,
		})),
	)
	const entrypoints = revisionSources
		.filter((source) => source.isEntrypoint)
		.map((source) => source.path)
		.toSorted((a, b) => a.localeCompare(b))
	const paths = revisionSources
		.toSorted(
			(a, b) =>
				Number(b.isEntrypoint) - Number(a.isEntrypoint) ||
				a.path.localeCompare(b.path),
		)
		.map((source) => source.path)

	const minimalResponse = buildNativeMinimalResponse({
		id: nativeContract.id,
		chainId: nativeContract.chainId,
		address: nativeContract.address as ArrayBuffer,
	})

	const formattedAddress = minimalResponse.address
	const abi = JSON.parse(nativeContract.abiJson) as unknown
	const signatures = buildSignaturesPayload(abi)
	const activationFromBlock =
		revision.protocolVersion !== null && revision.fromBlock === 0
			? null
			: String(revision.fromBlock)
	const fullResponse: Record<string, unknown> = {
		...minimalResponse,
		transactionHash: null,
		blockNumber: null,
		name: nativeContract.name,
		fullyQualifiedName: null,
		compiler: null,
		compilerVersion: null,
		language: nativeContract.language,
		compilerSettings: null,
		runtimeMetadataMatch: null,
		creationMetadataMatch: null,
		abi,
		userdoc: null,
		devdoc: null,
		storageLayout: null,
		metadata: null,
		sources,
		sourceIds,
		signatures,
		creationBytecode: null,
		runtimeBytecode: null,
		compilation: null,
		deployment: {
			chainId: String(nativeContract.chainId),
			address: formattedAddress,
			transactionHash: null,
			blockNumber: null,
			transactionIndex: null,
			deployer: null,
		},
		stdJsonInput: null,
		stdJsonOutput: null,
		proxyResolution: null,
		docsUrl: nativeContract.docsUrl ?? null,
		extensions: {
			tempo: {
				nativeSource: {
					kind: nativeContract.runtimeType,
					language: nativeContract.language,
					bytecodeVerified: false,
					repository: revision.repo,
					commit: revision.commitSha,
					commitUrl: revision.commitUrl,
					paths,
					entrypoints,
					activation: {
						protocolVersion: revision.protocolVersion,
						fromBlock: activationFromBlock,
						toBlock:
							revision.toBlock === null ? null : String(revision.toBlock),
					},
				},
			},
		},
	}

	return { minimalResponse, fullResponse }
}

/**
 * GET /v2/contract/{chainId}/{address}
 * GET /v2/contract/all-chains/{address}
 * GET /v2/contracts/{chainId}
 */

const lookupRoute = new Hono<{ Bindings: Cloudflare.Env }>()
const lookupAllChainContractsRoute = new Hono<{ Bindings: Cloudflare.Env }>()

// GET /v2/contract/all-chains/:address - Get verified contract at an address on all chains
// Note: This route must be defined before /:chainId/:address to avoid matching conflicts
lookupRoute
	.get('/all-chains/:address', async (context) => {
		try {
			const { address } = context.req.param()

			if (!Address.validate(address, { strict: true }))
				return sourcifyError(
					context,
					400,
					'invalid_address',
					`Invalid address: ${address}`,
				)

			const db = getDb(context.env.CONTRACTS_DB)
			const addressBytes = Hex.toBytes(address)

			const [verifiedResults, nativeResults] = await Promise.all([
				db
					.select({
						matchId: verifiedContractsTable.id,
						verifiedAt: verifiedContractsTable.createdAt,
						runtimeMatch: verifiedContractsTable.runtimeMatch,
						creationMatch: verifiedContractsTable.creationMatch,
						chainId: contractDeploymentsTable.chainId,
						address: contractDeploymentsTable.address,
					})
					.from(verifiedContractsTable)
					.innerJoin(
						contractDeploymentsTable,
						eq(
							verifiedContractsTable.deploymentId,
							contractDeploymentsTable.id,
						),
					)
					.innerJoin(
						compiledContractsTable,
						eq(verifiedContractsTable.compilationId, compiledContractsTable.id),
					)
					.where(eq(contractDeploymentsTable.address, addressBytes)),
				db
					.select({
						id: nativeContractsTable.id,
						chainId: nativeContractsTable.chainId,
						address: nativeContractsTable.address,
					})
					.from(nativeContractsTable)
					.where(eq(nativeContractsTable.address, addressBytes)),
			])

			const contracts = [
				...verifiedResults.map((row) =>
					buildVerifiedMinimalResponse({
						matchId: row.matchId,
						runtimeMatch: row.runtimeMatch,
						creationMatch: row.creationMatch,
						chainId: row.chainId,
						address: row.address as ArrayBuffer,
						verifiedAt: row.verifiedAt,
					}),
				),
				...nativeResults.map((row) =>
					buildNativeMinimalResponse({
						id: row.id,
						chainId: row.chainId,
						address: row.address as ArrayBuffer,
					}),
				),
			].toSorted(
				(a, b) =>
					Number(a.chainId) - Number(b.chainId) ||
					a.address.localeCompare(b.address),
			)

			return context.json({ results: contracts })
		} catch (error) {
			const { address } = context.req.param()
			logger.error('lookup_all_chains_failed', {
				error: formatError(error),
				address,
			})
			return sourcifyError(
				context,
				500,
				'internal_error',
				'An unexpected error occurred',
			)
		}
	})

	// GET /v2/contract/:chainId/:address - Get verified contract
	.get('/:chainId/:address', async (context) => {
		try {
			const { chainId, address } = context.req.param()
			const { fields, omit } = context.req.query()
			const chainIdNumber = Number(chainId)

			if (!Number.isInteger(chainIdNumber))
				return sourcifyError(
					context,
					400,
					'invalid_chain_id',
					`Invalid chainId format: ${chainId}`,
				)
			if (!chainIds.includes(chainIdNumber))
				return sourcifyError(
					context,
					400,
					'invalid_chain_id',
					`The chain with chainId ${chainId} is not supported`,
				)

			if (!Address.validate(address, { strict: true }))
				return sourcifyError(
					context,
					400,
					'invalid_address',
					`Invalid address: ${address}`,
				)

			if (fields && omit)
				return sourcifyError(
					context,
					400,
					'invalid_params',
					'Cannot use both fields and omit query parameters simultaneously',
				)

			const db = getDb(context.env.CONTRACTS_DB)
			const addressBytes = Hex.toBytes(address)

			// Query verified contract at this address on the specified chain
			const results = await db
				.select({
					// For minimal response
					matchId: verifiedContractsTable.id,
					verifiedAt: verifiedContractsTable.createdAt,
					runtimeMatch: verifiedContractsTable.runtimeMatch,
					creationMatch: verifiedContractsTable.creationMatch,
					runtimeMetadataMatch: verifiedContractsTable.runtimeMetadataMatch,
					creationMetadataMatch: verifiedContractsTable.creationMetadataMatch,
					runtimeValues: verifiedContractsTable.runtimeValues,
					creationValues: verifiedContractsTable.creationValues,
					runtimeTransformations: verifiedContractsTable.runtimeTransformations,
					creationTransformations:
						verifiedContractsTable.creationTransformations,
					// For extended response
					chainId: contractDeploymentsTable.chainId,
					address: contractDeploymentsTable.address,
					transactionHash: contractDeploymentsTable.transactionHash,
					blockNumber: contractDeploymentsTable.blockNumber,
					transactionIndex: contractDeploymentsTable.transactionIndex,
					deployer: contractDeploymentsTable.deployer,
					// Compilation info
					compilationId: compiledContractsTable.id,
					contractName: compiledContractsTable.name,
					fullyQualifiedName: compiledContractsTable.fullyQualifiedName,
					compiler: compiledContractsTable.compiler,
					version: compiledContractsTable.version,
					language: compiledContractsTable.language,
					compilerSettings: compiledContractsTable.compilerSettings,
					compilationArtifacts: compiledContractsTable.compilationArtifacts,
					creationCodeArtifacts: compiledContractsTable.creationCodeArtifacts,
					runtimeCodeArtifacts: compiledContractsTable.runtimeCodeArtifacts,
					creationCodeHash: compiledContractsTable.creationCodeHash,
					runtimeCodeHash: compiledContractsTable.runtimeCodeHash,
				})
				.from(verifiedContractsTable)
				.innerJoin(
					contractDeploymentsTable,
					eq(verifiedContractsTable.deploymentId, contractDeploymentsTable.id),
				)
				.innerJoin(
					compiledContractsTable,
					eq(verifiedContractsTable.compilationId, compiledContractsTable.id),
				)
				.where(
					and(
						eq(contractDeploymentsTable.chainId, chainIdNumber),
						eq(contractDeploymentsTable.address, addressBytes),
					),
				)
				.limit(1)

			const [row] = results
			if (!row) {
				const nativeLookup = await getNativeLookupResponse(
					db,
					chainIdNumber,
					addressBytes,
				)
				if (nativeLookup) {
					return context.json(
						applyFieldSelection(
							nativeLookup.fullResponse,
							nativeLookup.minimalResponse,
							fields,
							omit,
						),
					)
				}

				return sourcifyError(
					context,
					404,
					'contract_not_found',
					`Contract ${address} on chain ${chainId} not found or not verified`,
				)
			}

			const minimalResponse = buildVerifiedMinimalResponse({
				matchId: row.matchId,
				runtimeMatch: row.runtimeMatch,
				creationMatch: row.creationMatch,
				chainId: row.chainId,
				address: row.address as ArrayBuffer,
				verifiedAt: row.verifiedAt,
			})

			// If no fields requested, return minimal response
			if (!fields && !omit) return context.json(minimalResponse)

			// Fetch bytecode from code table
			const [creationCode, runtimeCode] = await Promise.all([
				row.creationCodeHash
					? db
							.select({ code: codeTable.code })
							.from(codeTable)
							.where(eq(codeTable.codeHash, row.creationCodeHash))
							.limit(1)
					: Promise.resolve([]),
				row.runtimeCodeHash
					? db
							.select({ code: codeTable.code })
							.from(codeTable)
							.where(eq(codeTable.codeHash, row.runtimeCodeHash))
							.limit(1)
					: Promise.resolve([]),
			])

			// Fetch sources
			const sourcesResult = await db
				.select({
					path: compiledContractsSourcesTable.path,
					content: sourcesTable.content,
					sourceHash: sourcesTable.sourceHash,
				})
				.from(compiledContractsSourcesTable)
				.innerJoin(
					sourcesTable,
					eq(compiledContractsSourcesTable.sourceHash, sourcesTable.sourceHash),
				)
				.where(
					eq(compiledContractsSourcesTable.compilationId, row.compilationId),
				)

			// Fetch signatures
			const signaturesResult = await db
				.select({
					signature: signaturesTable.signature,
					signatureType: compiledContractsSignaturesTable.signatureType,
					signatureHash32: signaturesTable.signatureHash32,
				})
				.from(compiledContractsSignaturesTable)
				.innerJoin(
					signaturesTable,
					eq(
						compiledContractsSignaturesTable.signatureHash32,
						signaturesTable.signatureHash32,
					),
				)
				.where(
					eq(compiledContractsSignaturesTable.compilationId, row.compilationId),
				)

			const { sources, sourceIds } = buildSourcesPayload(
				sourcesResult.map((source) => ({
					path: source.path,
					content: source.content,
					sourceHash: source.sourceHash as ArrayBuffer,
				})),
			)

			// Build signatures object (Sourcify format: grouped by type)
			const signatures: {
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
			} = { function: [], event: [], error: [] }

			for (const sig of signaturesResult) {
				const hash32Bytes = new Uint8Array(sig.signatureHash32 as ArrayBuffer)
				const signatureHash32 = Hex.fromBytes(hash32Bytes)
				const signatureHash4 = Hex.fromBytes(hash32Bytes.slice(0, 4))
				const type = sig.signatureType

				signatures[type].push({
					signature: sig.signature,
					signatureHash32,
					signatureHash4,
				})
			}

			// Build full response for field filtering
			const artifacts = JSON.parse(row.compilationArtifacts ?? '{}') as {
				abi?: unknown[]
				userdoc?: unknown
				devdoc?: unknown
				storageLayout?: unknown
				metadata?: unknown
			}

			const creationCodeArtifacts = JSON.parse(
				row.creationCodeArtifacts ?? '{}',
			) as {
				sourceMap?: string
				linkReferences?: unknown
				cborAuxdata?: unknown
			}

			const runtimeCodeArtifacts = JSON.parse(
				row.runtimeCodeArtifacts ?? '{}',
			) as {
				sourceMap?: string
				linkReferences?: unknown
				immutableReferences?: unknown
				cborAuxdata?: unknown
			}

			const creationBytecodeData = creationCode[0]?.code
				? Hex.fromBytes(new Uint8Array(creationCode[0].code as ArrayBuffer))
				: null
			const runtimeBytecodeData = runtimeCode[0]?.code
				? Hex.fromBytes(new Uint8Array(runtimeCode[0].code as ArrayBuffer))
				: null

			// Build stdJsonInput
			const stdJsonInput = {
				language: row.language,
				sources: Object.fromEntries(
					Object.entries(sources).map(([path, { content }]) => [
						path,
						{ content },
					]),
				),
				settings: JSON.parse(row.compilerSettings),
			}

			// Build stdJsonOutput (partial - what we have stored)
			const stdJsonOutput = {
				contracts: {
					[row.fullyQualifiedName.split(':')[0] ?? '']: {
						[row.contractName]: {
							abi: artifacts.abi,
							metadata:
								typeof artifacts.metadata === 'string'
									? artifacts.metadata
									: JSON.stringify(artifacts.metadata ?? {}),
							userdoc: artifacts.userdoc,
							devdoc: artifacts.devdoc,
							storageLayout: artifacts.storageLayout,
							evm: {
								bytecode: {
									object: creationBytecodeData,
									sourceMap: creationCodeArtifacts.sourceMap,
									linkReferences: creationCodeArtifacts.linkReferences,
								},
								deployedBytecode: {
									object: runtimeBytecodeData,
									sourceMap: runtimeCodeArtifacts.sourceMap,
									linkReferences: runtimeCodeArtifacts.linkReferences,
									immutableReferences: runtimeCodeArtifacts.immutableReferences,
								},
							},
						},
					},
				},
			}

			const fullResponse: Record<string, unknown> = {
				...minimalResponse,
				transactionHash: row.transactionHash
					? bytesToHex(row.transactionHash as ArrayBuffer)
					: null,
				blockNumber: row.blockNumber,
				name: row.contractName,
				fullyQualifiedName: row.fullyQualifiedName,
				compiler: row.compiler,
				compilerVersion: row.version,
				language: row.language,
				compilerSettings: JSON.parse(row.compilerSettings),
				runtimeMetadataMatch: row.runtimeMetadataMatch
					? 'exact_match'
					: 'match',
				creationMetadataMatch: row.creationMetadataMatch
					? 'exact_match'
					: 'match',
				abi: artifacts.abi ?? null,
				userdoc: artifacts.userdoc ?? null,
				devdoc: artifacts.devdoc ?? null,
				storageLayout: artifacts.storageLayout ?? null,
				metadata: artifacts.metadata ?? null,
				sources,
				sourceIds,
				signatures,
				creationBytecode: creationBytecodeData
					? {
							bytecode: creationBytecodeData,
							sourceMap: creationCodeArtifacts.sourceMap ?? null,
							linkReferences: creationCodeArtifacts.linkReferences ?? null,
							cborAuxdata: creationCodeArtifacts.cborAuxdata ?? null,
						}
					: null,
				runtimeBytecode: runtimeBytecodeData
					? {
							bytecode: runtimeBytecodeData,
							sourceMap: runtimeCodeArtifacts.sourceMap ?? null,
							linkReferences: runtimeCodeArtifacts.linkReferences ?? null,
							immutableReferences:
								runtimeCodeArtifacts.immutableReferences ?? null,
							cborAuxdata: runtimeCodeArtifacts.cborAuxdata ?? null,
						}
					: null,
				compilation: {
					compiler: row.compiler,
					compilerVersion: row.version,
					language: row.language,
					name: row.contractName,
					fullyQualifiedName: row.fullyQualifiedName,
					compilerSettings: JSON.parse(row.compilerSettings),
				},
				deployment: {
					chainId: String(row.chainId),
					address: minimalResponse.address,
					transactionHash: row.transactionHash
						? bytesToHex(row.transactionHash as ArrayBuffer)
						: null,
					blockNumber: row.blockNumber,
					transactionIndex: row.transactionIndex,
					deployer: row.deployer
						? bytesToHex(row.deployer as ArrayBuffer)
						: null,
				},
				stdJsonInput,
				stdJsonOutput,
				proxyResolution: null, // Not implemented yet
			}

			return context.json(
				applyFieldSelection(fullResponse, minimalResponse, fields, omit),
			)
		} catch (error) {
			const { chainId, address } = context.req.param()
			logger.error('lookup_contract_failed', {
				error: formatError(error),
				chainId,
				address,
			})
			return sourcifyError(
				context,
				500,
				'internal_error',
				'An unexpected error occurred',
			)
		}
	})

// GET /v2/contracts/:chainId - List verified contracts on a specific chain
lookupAllChainContractsRoute.get('/:chainId', async (context) => {
	try {
		const { chainId } = context.req.param()
		const { sort, limit, afterMatchId } = context.req.query()
		const chainIdNumber = Number(chainId)

		if (!Number.isInteger(chainIdNumber))
			return sourcifyError(
				context,
				400,
				'invalid_chain_id',
				`Invalid chainId format: ${chainId}`,
			)
		if (!chainIds.includes(chainIdNumber))
			return sourcifyError(
				context,
				400,
				'invalid_chain_id',
				`The chain with chainId ${chainId} is not supported`,
			)

		// Validate and parse query params
		const sortOrder = sort === 'asc' ? 'asc' : 'desc'
		const limitNum = Math.min(Math.max(Number(limit) || 200, 1), 200)
		const parsedAfterMatchId =
			afterMatchId === undefined ? null : parseMatchCursor(afterMatchId)

		if (afterMatchId !== undefined && !parsedAfterMatchId) {
			return sourcifyError(
				context,
				400,
				'invalid_match_id',
				`Invalid afterMatchId format: ${afterMatchId}`,
			)
		}

		const db = getDb(context.env.CONTRACTS_DB)

		const shouldQueryVerified =
			parsedAfterMatchId?.kind !== 'native' || sortOrder === 'asc'
		const verifiedWhere =
			parsedAfterMatchId?.kind === 'verified'
				? and(
						eq(contractDeploymentsTable.chainId, chainIdNumber),
						sortOrder === 'desc'
							? lt(verifiedContractsTable.id, parsedAfterMatchId.value)
							: gt(verifiedContractsTable.id, parsedAfterMatchId.value),
					)
				: eq(contractDeploymentsTable.chainId, chainIdNumber)

		const verifiedResults = shouldQueryVerified
			? await db
					.select({
						matchId: verifiedContractsTable.id,
						chainId: contractDeploymentsTable.chainId,
						address: contractDeploymentsTable.address,
						verifiedAt: verifiedContractsTable.createdAt,
						runtimeMatch: verifiedContractsTable.runtimeMatch,
						creationMatch: verifiedContractsTable.creationMatch,
					})
					.from(verifiedContractsTable)
					.innerJoin(
						contractDeploymentsTable,
						eq(
							verifiedContractsTable.deploymentId,
							contractDeploymentsTable.id,
						),
					)
					.where(verifiedWhere)
					.orderBy(
						sortOrder === 'desc'
							? desc(verifiedContractsTable.id)
							: asc(verifiedContractsTable.id),
					)
					.limit(limitNum)
			: []

		const shouldQueryNative =
			parsedAfterMatchId?.kind !== 'verified' || sortOrder === 'desc'
		const nativeWhere =
			parsedAfterMatchId?.kind === 'native'
				? and(
						eq(nativeContractsTable.chainId, chainIdNumber),
						sortOrder === 'desc'
							? lt(nativeContractsTable.id, parsedAfterMatchId.value)
							: gt(nativeContractsTable.id, parsedAfterMatchId.value),
					)
				: eq(nativeContractsTable.chainId, chainIdNumber)

		const nativeResults = shouldQueryNative
			? await db
					.select({
						id: nativeContractsTable.id,
						chainId: nativeContractsTable.chainId,
						address: nativeContractsTable.address,
					})
					.from(nativeContractsTable)
					.where(nativeWhere)
					.orderBy(
						sortOrder === 'desc'
							? desc(nativeContractsTable.id)
							: asc(nativeContractsTable.id),
					)
					.limit(limitNum)
			: []

		const verifiedContracts = verifiedResults.map((row) =>
			buildVerifiedMinimalResponse({
				matchId: row.matchId,
				runtimeMatch: row.runtimeMatch,
				creationMatch: row.creationMatch,
				chainId: row.chainId,
				address: row.address as ArrayBuffer,
				verifiedAt: row.verifiedAt,
			}),
		)
		const nativeContracts = nativeResults.map((row) =>
			buildNativeMinimalResponse({
				id: row.id,
				chainId: row.chainId,
				address: row.address as ArrayBuffer,
			}),
		)
		const contracts =
			sortOrder === 'desc'
				? [...verifiedContracts, ...nativeContracts].slice(0, limitNum)
				: [...nativeContracts, ...verifiedContracts].slice(0, limitNum)

		return context.json({ results: contracts })
	} catch (error) {
		const { chainId } = context.req.param()
		logger.error('list_contracts_failed', {
			error: formatError(error),
			chainId,
		})
		return sourcifyError(
			context,
			500,
			'internal_error',
			'An unexpected error occurred',
		)
	}
})

export { lookupRoute, lookupAllChainContractsRoute }
