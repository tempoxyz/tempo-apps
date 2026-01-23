import { getContainer } from '@cloudflare/containers'
import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { Address, Hex } from 'ox'
import { createPublicClient, http, keccak256 } from 'viem'

import {
	AuxdataStyle,
	getVyperAuxdataStyle,
	getVyperImmutableReferences,
	type ImmutableReferences,
	type LinkReferences,
	matchBytecode,
} from '#bytecode-matching.ts'
import { chains, CHAIN_IDS } from '#chains.ts'

import {
	codeTable,
	compiledContractsSignaturesTable,
	compiledContractsSourcesTable,
	compiledContractsTable,
	contractDeploymentsTable,
	contractsTable,
	type SignatureType,
	signaturesTable,
	sourcesTable,
	verificationJobsTable,
	verifiedContractsTable,
} from '#database/schema.ts'
import { log, normalizeSourcePath, sourcifyError } from '#utilities.ts'

/**
 * TODO:
 * - handle different solc versions
 * - routes:
 *   - /metadata/:chainId/:address
 *   - /similarity/:chainId/:address
 *   - /:verificationId
 */

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

const verifyRoute = new Hono<{ Bindings: Cloudflare.Env }>()

// POST /v2/verify/metadata/:chainId/:address - Verify Contract (using Solidity metadata.json)
verifyRoute.post('/metadata/:chainId/:address', (context) =>
	sourcifyError(
		context,
		501,
		'not_implemented',
		'Metadata-based verification is not implemented',
	),
)

// POST /v2/verify/similarity/:chainId/:address - Verify contract via similarity search
verifyRoute.post('/similarity/:chainId/:address', (context) =>
	sourcifyError(
		context,
		501,
		'not_implemented',
		'Similarity-based verification is not implemented',
	),
)

type VerificationInput = {
	stdJsonInput: {
		language: string
		sources: Record<string, { content: string }>
		settings: object
	}
	compilerVersion: string
	contractIdentifier: string
	creationTransactionHash?: string
}

type PublicClientLike = {
	getCode: (args: { address: `0x${string}` }) => Promise<`0x${string}`>
}

type ContainerLike = {
	fetch: (request: Request) => Promise<Response>
}

type VerificationDeps = {
	getContainer?: (
		binding: Cloudflare.Env['VERIFICATION_CONTAINER'],
		name: string,
	) => ContainerLike
	createPublicClient?: (params: {
		chain: (typeof chains)[keyof typeof chains]
		transport: ReturnType<typeof http>
	}) => PublicClientLike
}

type CompileOutput = {
	contracts?: Record<
		string,
		Record<
			string,
			{
				abi: Array<{
					type: string
					name?: string
					inputs?: Array<{ type: string; name?: string }>
				}>
				evm: {
					bytecode: {
						object: string
						linkReferences?: LinkReferences
						sourceMap?: string
					}
					deployedBytecode: {
						object: string
						linkReferences?: LinkReferences
						immutableReferences?: ImmutableReferences
						sourceMap?: string
					}
				}
				metadata?: string
				storageLayout?: unknown
				userdoc?: unknown
				devdoc?: unknown
			}
		>
	>
	errors?: Array<{
		severity: string
		message: string
		formattedMessage?: string
	}>
}

async function runVerificationJob(
	env: Cloudflare.Env,
	jobId: string,
	chainId: number,
	address: string,
	body: VerificationInput,
	deps?: VerificationDeps,
): Promise<void> {
	const db = drizzle(env.CONTRACTS_DB)
	Hex.assert(address)
	const addressBytes = Hex.toBytes(address)
	const startTime = Date.now()

	const { stdJsonInput, compilerVersion, contractIdentifier } = body
	const language = stdJsonInput.language?.toLowerCase() ?? 'solidity'
	const isVyper = language === 'vyper'

	const lastColonIndex = contractIdentifier.lastIndexOf(':')
	const contractPath = contractIdentifier.slice(0, lastColonIndex)
	const contractName = contractIdentifier.slice(lastColonIndex + 1)

	try {
		const chain = chains[chainId as keyof typeof chains]
		const createClient = deps?.createPublicClient ?? createPublicClient
		const client = createClient({
			chain,
			transport: http(chain.rpcUrls.default.http.at(0)),
		})

		const onchainBytecode = await client.getCode({ address })
		if (!onchainBytecode || onchainBytecode === '0x') {
			await db
				.update(verificationJobsTable)
				.set({
					completedAt: new Date().toISOString(),
					errorCode: 'contract_not_found',
					errorData: JSON.stringify({
						message: `No bytecode found at address ${address} on chain ${chainId}`,
					}),
					compilationTime: Date.now() - startTime,
				})
				.where(eq(verificationJobsTable.id, jobId))
			return
		}

		// Compile via container
		const getContainerFn = deps?.getContainer ?? getContainer
		const container = getContainerFn(env.VERIFICATION_CONTAINER, 'singleton')
		const compileEndpoint = isVyper
			? 'http://container/compile/vyper'
			: 'http://container/compile'

		const compileResponse = await container.fetch(
			new Request(compileEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					compilerVersion,
					contractIdentifier,
					input: stdJsonInput,
				}),
			}),
		)

		if (!compileResponse.ok) {
			const errorText = await compileResponse.text()
			await db
				.update(verificationJobsTable)
				.set({
					completedAt: new Date().toISOString(),
					errorCode: 'compilation_failed',
					errorData: JSON.stringify({ message: errorText }),
					compilationTime: Date.now() - startTime,
				})
				.where(eq(verificationJobsTable.id, jobId))
			return
		}

		const compileOutput = (await compileResponse.json()) as CompileOutput

		const errors =
			compileOutput.errors?.filter((e) => e.severity === 'error') ?? []
		if (errors.length > 0) {
			await db
				.update(verificationJobsTable)
				.set({
					completedAt: new Date().toISOString(),
					errorCode: 'compilation_error',
					errorData: JSON.stringify({
						message: errors
							.map((error) => error.formattedMessage ?? error.message)
							.join('\n'),
					}),
					compilationTime: Date.now() - startTime,
				})
				.where(eq(verificationJobsTable.id, jobId))
			return
		}

		// Get compiled bytecode for the target contract
		let compiledContract =
			compileOutput.contracts?.[contractPath]?.[contractName]

		if (!compiledContract && compileOutput.contracts) {
			for (const outputPath of Object.keys(compileOutput.contracts)) {
				if (
					outputPath.endsWith(contractPath) ||
					outputPath.endsWith(`/${contractPath}`)
				) {
					compiledContract = compileOutput.contracts[outputPath]?.[contractName]
					if (compiledContract) break
				}
			}
		}

		if (!compiledContract) {
			await db
				.update(verificationJobsTable)
				.set({
					completedAt: new Date().toISOString(),
					errorCode: 'contract_not_found_in_output',
					errorData: JSON.stringify({
						message: `Could not find ${contractName} in ${contractPath}`,
					}),
					compilationTime: Date.now() - startTime,
				})
				.where(eq(verificationJobsTable.id, jobId))
			return
		}

		const deployedObject = compiledContract.evm.deployedBytecode.object
		const bytecodeObject = compiledContract.evm.bytecode.object
		const compiledBytecode = deployedObject.startsWith('0x')
			? deployedObject
			: `0x${deployedObject}`
		const creationBytecodeRaw = bytecodeObject.startsWith('0x')
			? bytecodeObject
			: `0x${bytecodeObject}`

		// Compare bytecodes using proper matching with transformations
		const auxdataStyle = isVyper
			? getVyperAuxdataStyle(compilerVersion)
			: AuxdataStyle.SOLIDITY

		const immutableReferences = isVyper
			? getVyperImmutableReferences(
					compilerVersion,
					creationBytecodeRaw,
					compiledBytecode,
				)
			: compiledContract.evm.deployedBytecode.immutableReferences

		const linkReferences = isVyper
			? undefined
			: compiledContract.evm.deployedBytecode.linkReferences

		const runtimeMatchResult = matchBytecode({
			onchainBytecode: onchainBytecode,
			recompiledBytecode: compiledBytecode,
			isCreation: false,
			linkReferences,
			immutableReferences,
			auxdataStyle,
			abi: compiledContract.abi,
		})

		if (runtimeMatchResult.match === null) {
			await db
				.update(verificationJobsTable)
				.set({
					completedAt: new Date().toISOString(),
					errorCode: 'no_match',
					errorData: JSON.stringify({
						message:
							runtimeMatchResult.message ||
							'Compiled bytecode does not match on-chain bytecode',
					}),
					compilationTime: Date.now() - startTime,
				})
				.where(eq(verificationJobsTable.id, jobId))
			return
		}

		const isExactMatch = runtimeMatchResult.match === 'exact_match'
		const auditUser = 'verification-api'

		// Compute hashes for runtime bytecode
		Hex.assert(compiledBytecode)
		const runtimeBytecodeBytes = Hex.toBytes(compiledBytecode)
		const runtimeCodeHashSha256 = new Uint8Array(
			await globalThis.crypto.subtle.digest(
				'SHA-256',
				new TextEncoder().encode(compiledBytecode),
			),
		)
		const runtimeCodeHashKeccak = Hex.toBytes(keccak256(compiledBytecode))

		// Compute hashes for creation bytecode
		const creationBytecode = creationBytecodeRaw
		Hex.assert(creationBytecode)
		const creationBytecodeBytes = Hex.toBytes(creationBytecode)
		const creationCodeHashSha256 = new Uint8Array(
			await globalThis.crypto.subtle.digest(
				'SHA-256',
				new TextEncoder().encode(creationBytecode),
			),
		)
		const creationCodeHashKeccak = Hex.toBytes(keccak256(creationBytecode))

		// Insert runtime code
		await db
			.insert(codeTable)
			.values({
				codeHash: runtimeCodeHashSha256,
				codeHashKeccak: runtimeCodeHashKeccak,
				code: runtimeBytecodeBytes,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
			.onConflictDoNothing()

		// Insert creation code
		await db
			.insert(codeTable)
			.values({
				codeHash: creationCodeHashSha256,
				codeHashKeccak: creationCodeHashKeccak,
				code: creationBytecodeBytes,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
			.onConflictDoNothing()

		// Get or create contract
		const existingContract = await db
			.select({ id: contractsTable.id })
			.from(contractsTable)
			.where(eq(contractsTable.runtimeCodeHash, runtimeCodeHashSha256))
			.limit(1)

		let contractId: string
		if (existingContract.length > 0 && existingContract[0]) {
			contractId = existingContract[0].id
		} else {
			contractId = globalThis.crypto.randomUUID()
			await db.insert(contractsTable).values({
				id: contractId,
				creationCodeHash: creationCodeHashSha256,
				runtimeCodeHash: runtimeCodeHashSha256,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
		}

		// Get or create deployment
		const existingDeployment = await db
			.select({ id: contractDeploymentsTable.id })
			.from(contractDeploymentsTable)
			.where(
				and(
					eq(contractDeploymentsTable.chainId, chainId),
					eq(contractDeploymentsTable.address, addressBytes),
				),
			)
			.limit(1)

		let deploymentId: string
		if (existingDeployment.length > 0 && existingDeployment[0]) {
			deploymentId = existingDeployment[0].id
		} else {
			deploymentId = globalThis.crypto.randomUUID()
			await db.insert(contractDeploymentsTable).values({
				id: deploymentId,
				chainId: chainId,
				address: addressBytes,
				contractId,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
		}

		// Get or create compiled contract
		const compilerName = isVyper ? 'vyper' : 'solc'
		const existingCompilation = await db
			.select({ id: compiledContractsTable.id })
			.from(compiledContractsTable)
			.where(
				and(
					eq(compiledContractsTable.runtimeCodeHash, runtimeCodeHashSha256),
					eq(compiledContractsTable.compiler, compilerName),
					eq(compiledContractsTable.version, body.compilerVersion),
				),
			)
			.limit(1)

		let compilationId: string
		if (existingCompilation.length > 0 && existingCompilation[0]) {
			compilationId = existingCompilation[0].id
		} else {
			compilationId = globalThis.crypto.randomUUID()

			const creationCodeArtifacts = {
				sourceMap: compiledContract.evm.bytecode.sourceMap,
				linkReferences: isVyper
					? undefined
					: compiledContract.evm.bytecode.linkReferences,
			}
			const runtimeCodeArtifacts = {
				sourceMap: compiledContract.evm.deployedBytecode.sourceMap,
				linkReferences,
				immutableReferences,
			}

			const compilationArtifacts = {
				abi: compiledContract.abi,
				metadata: compiledContract.metadata,
				storageLayout: compiledContract.storageLayout,
				userdoc: compiledContract.userdoc,
				devdoc: compiledContract.devdoc,
			}

			await db.insert(compiledContractsTable).values({
				id: compilationId,
				compiler: compilerName,
				version: body.compilerVersion,
				language: stdJsonInput.language,
				name: contractName,
				fullyQualifiedName: contractIdentifier,
				compilerSettings: JSON.stringify(stdJsonInput.settings),
				compilationArtifacts: JSON.stringify(compilationArtifacts),
				creationCodeHash: creationCodeHashSha256,
				creationCodeArtifacts: JSON.stringify(creationCodeArtifacts),
				runtimeCodeHash: runtimeCodeHashSha256,
				runtimeCodeArtifacts: JSON.stringify(runtimeCodeArtifacts),
				createdBy: auditUser,
				updatedBy: auditUser,
			})
		}

		// Insert sources and link them to the compilation
		for (const [sourcePath, sourceData] of Object.entries(
			stdJsonInput.sources,
		)) {
			const content = sourceData.content
			const contentBytes = new TextEncoder().encode(content)
			const sourceHashSha256 = new Uint8Array(
				await globalThis.crypto.subtle.digest('SHA-256', contentBytes),
			)
			const sourceHashKeccak = Hex.toBytes(
				keccak256(Hex.fromBytes(contentBytes)),
			)

			await db
				.insert(sourcesTable)
				.values({
					sourceHash: sourceHashSha256,
					sourceHashKeccak: sourceHashKeccak,
					content: content,
					createdBy: auditUser,
					updatedBy: auditUser,
				})
				.onConflictDoNothing()

			const normalizedPath = normalizeSourcePath(sourcePath)
			await db
				.insert(compiledContractsSourcesTable)
				.values({
					id: globalThis.crypto.randomUUID(),
					compilationId: compilationId,
					sourceHash: sourceHashSha256,
					path: normalizedPath,
				})
				.onConflictDoNothing()
		}

		// Extract and insert signatures from ABI
		const abi = compiledContract.abi
		for (const item of abi) {
			let signatureType: SignatureType | null = null
			if (item.type === 'function') signatureType = 'function'
			else if (item.type === 'event') signatureType = 'event'
			else if (item.type === 'error') signatureType = 'error'

			if (signatureType && item.name) {
				const inputTypes = (item.inputs ?? []).map((i) => i.type).join(',')
				const signature = `${item.name}(${inputTypes})`
				const signatureHash32 = Hex.toBytes(
					keccak256(Hex.fromString(signature)),
				)

				await db
					.insert(signaturesTable)
					.values({
						signatureHash32: signatureHash32,
						signature: signature,
					})
					.onConflictDoNothing()

				await db
					.insert(compiledContractsSignaturesTable)
					.values({
						id: globalThis.crypto.randomUUID(),
						compilationId: compilationId,
						signatureHash32: signatureHash32,
						signatureType: signatureType,
					})
					.onConflictDoNothing()
			}
		}

		// Insert verified contract with transformation data
		await db
			.insert(verifiedContractsTable)
			.values({
				deploymentId,
				compilationId,
				creationMatch: false,
				runtimeMatch: true,
				runtimeMetadataMatch: isExactMatch,
				runtimeValues:
					Object.keys(runtimeMatchResult.transformationValues).length > 0
						? JSON.stringify(runtimeMatchResult.transformationValues)
						: null,
				runtimeTransformations:
					runtimeMatchResult.transformations.length > 0
						? JSON.stringify(runtimeMatchResult.transformations)
						: null,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
			.onConflictDoNothing()

		const verificationResult = await db
			.select({ id: verifiedContractsTable.id })
			.from(verifiedContractsTable)
			.where(eq(verifiedContractsTable.deploymentId, deploymentId))
			.limit(1)

		const verifiedContractId = verificationResult.at(0)?.id ?? null

		// Mark job as completed
		await db
			.update(verificationJobsTable)
			.set({
				completedAt: new Date().toISOString(),
				verifiedContractId,
				compilationTime: Date.now() - startTime,
			})
			.where(eq(verificationJobsTable.id, jobId))
	} catch (error) {
		console.error('Verification job failed:', error)
		await db
			.update(verificationJobsTable)
			.set({
				completedAt: new Date().toISOString(),
				errorCode: 'internal_error',
				errorId: globalThis.crypto.randomUUID(),
				errorData: JSON.stringify({
					message: error instanceof Error ? error.message : 'Unknown error',
				}),
				compilationTime: Date.now() - startTime,
			})
			.where(eq(verificationJobsTable.id, jobId))
	}
}

// POST /v2/verify/:chainId/:address - Verify Contract (Standard JSON)
verifyRoute.post('/:chainId/:address', async (context) => {
	try {
		const { chainId: _chainId, address } = context.req.param()
		const body = (await context.req.json()) as VerificationInput

		const chainId = Number(_chainId)
		if (!CHAIN_IDS.includes(chainId)) {
			return sourcifyError(
				context,
				400,
				'unsupported_chain',
				`The chain with chainId ${chainId} is not supported`,
			)
		}

		if (!Address.validate(address, { strict: true })) {
			return sourcifyError(
				context,
				400,
				'invalid_address',
				`Invalid address: ${address}`,
			)
		}

		if (
			!Object.hasOwn(body, 'stdJsonInput') ||
			!Object.hasOwn(body, 'compilerVersion') ||
			!Object.hasOwn(body, 'contractIdentifier')
		) {
			return sourcifyError(
				context,
				400,
				'missing_params',
				'stdJsonInput, compilerVersion, and contractIdentifier are required',
			)
		}

		const { contractIdentifier } = body

		// Parse contractIdentifier to validate format
		const lastColonIndex = contractIdentifier.lastIndexOf(':')
		if (lastColonIndex === -1) {
			return sourcifyError(
				context,
				400,
				'invalid_contract_identifier',
				'contractIdentifier must be in format "path/to/Contract.sol:ContractName"',
			)
		}

		const db = drizzle(context.env.CONTRACTS_DB)
		const addressBytes = Hex.toBytes(address)

		// Check if already verified
		const existingVerification = await db
			.select({
				matchId: verifiedContractsTable.id,
			})
			.from(verifiedContractsTable)
			.innerJoin(
				contractDeploymentsTable,
				eq(verifiedContractsTable.deploymentId, contractDeploymentsTable.id),
			)
			.where(
				and(
					eq(contractDeploymentsTable.chainId, chainId),
					eq(contractDeploymentsTable.address, addressBytes),
				),
			)
			.limit(1)

		if (existingVerification.length > 0) {
			return context.json(
				{ verificationId: existingVerification.at(0)?.matchId?.toString() },
				202,
			)
		}

		// Check if there's already a pending job for this contract
		const existingJob = await db
			.select({ id: verificationJobsTable.id })
			.from(verificationJobsTable)
			.where(
				and(
					eq(verificationJobsTable.chainId, chainId),
					eq(verificationJobsTable.contractAddress, addressBytes),
					isNull(verificationJobsTable.completedAt),
				),
			)
			.limit(1)

		if (existingJob.length > 0 && existingJob[0]) {
			return context.json({ verificationId: existingJob[0].id }, 202)
		}

		// Create verification job
		const jobId = globalThis.crypto.randomUUID()
		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
		})

		// Run verification in background
		context.executionCtx.waitUntil(
			runVerificationJob(context.env, jobId, chainId, address, body),
		)

		return context.json({ verificationId: jobId }, 202)
	} catch (error) {
		const { chainId, address } = context.req.param()
		log
			.fromContext(context)
			.error('verify_contract_failed', error, { chainId, address })
		return sourcifyError(
			context,
			500,
			'internal_error',
			'An unexpected error occurred',
		)
	}
})

// GET /v2/verify/:verificationId - Check verification job status
verifyRoute.get('/:verificationId', async (context) => {
	try {
		const { verificationId } = context.req.param()
		const db = drizzle(context.env.CONTRACTS_DB)

		// First check if this is a job ID (UUID format)
		const isJobId =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				verificationId,
			)

		if (isJobId) {
			// Look up the job
			const job = await db
				.select({
					id: verificationJobsTable.id,
					completedAt: verificationJobsTable.completedAt,
					verifiedContractId: verificationJobsTable.verifiedContractId,
					errorCode: verificationJobsTable.errorCode,
					errorId: verificationJobsTable.errorId,
					errorData: verificationJobsTable.errorData,
					chainId: verificationJobsTable.chainId,
					contractAddress: verificationJobsTable.contractAddress,
				})
				.from(verificationJobsTable)
				.where(eq(verificationJobsTable.id, verificationId))
				.limit(1)

			if (job.length > 0 && job[0]) {
				const j = job[0]

				// Job not completed yet
				if (!j.completedAt) {
					return context.json({
						isJobCompleted: false,
						verificationId,
						contract: {
							match: null,
							creationMatch: null,
							runtimeMatch: null,
							chainId: String(j.chainId),
							address: Hex.fromBytes(
								new Uint8Array(j.contractAddress as ArrayBuffer),
							),
						},
					})
				}

				// Job failed - Sourcify returns 200 even for failed jobs
				if (j.errorCode) {
					const errorData = j.errorData
						? (JSON.parse(j.errorData) as { message?: string })
						: {}
					return context.json({
						isJobCompleted: true,
						verificationId,
						error: {
							customCode: j.errorCode,
							message: errorData.message || 'Verification failed',
							errorId: j.errorId || globalThis.crypto.randomUUID(),
						},
					})
				}

				// Job completed successfully - use the verifiedContractId to get details
				if (j.verifiedContractId) {
					const result = await db
						.select({
							matchId: verifiedContractsTable.id,
							verifiedAt: verifiedContractsTable.createdAt,
							runtimeMatch: verifiedContractsTable.runtimeMatch,
							creationMatch: verifiedContractsTable.creationMatch,
							runtimeMetadataMatch: verifiedContractsTable.runtimeMetadataMatch,
							chainId: contractDeploymentsTable.chainId,
							address: contractDeploymentsTable.address,
							contractName: compiledContractsTable.name,
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
							eq(
								verifiedContractsTable.compilationId,
								compiledContractsTable.id,
							),
						)
						.where(eq(verifiedContractsTable.id, j.verifiedContractId))
						.limit(1)

					if (result.length > 0 && result[0]) {
						const v = result[0]
						const runtimeMatchStatus = v.runtimeMetadataMatch
							? 'exact_match'
							: 'match'
						const creationMatchStatus = v.creationMatch
							? 'exact_match'
							: 'match'

						// Sourcify-compatible response format for completed jobs
						return context.json({
							isJobCompleted: true,
							verificationId,
							contract: {
								match: runtimeMatchStatus,
								creationMatch: creationMatchStatus,
								runtimeMatch: runtimeMatchStatus,
								chainId: String(v.chainId),
								address: Hex.fromBytes(
									new Uint8Array(v.address as ArrayBuffer),
								),
								verifiedAt: v.verifiedAt,
								matchId: String(v.matchId),
								name: v.contractName,
							},
						})
					}
				}
			}
		}

		// Not a job ID or job not found - try as verified contract ID (numeric)
		const numericId = Number(verificationId)
		if (!Number.isNaN(numericId)) {
			const result = await db
				.select({
					matchId: verifiedContractsTable.id,
					verifiedAt: verifiedContractsTable.createdAt,
					runtimeMatch: verifiedContractsTable.runtimeMatch,
					creationMatch: verifiedContractsTable.creationMatch,
					runtimeMetadataMatch: verifiedContractsTable.runtimeMetadataMatch,
					chainId: contractDeploymentsTable.chainId,
					address: contractDeploymentsTable.address,
					contractName: compiledContractsTable.name,
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
				.where(eq(verifiedContractsTable.id, numericId))
				.limit(1)

			if (result.length > 0 && result[0]) {
				const v = result[0]
				const runtimeMatchStatus = v.runtimeMetadataMatch
					? 'exact_match'
					: 'match'
				const creationMatchStatus = v.creationMatch ? 'exact_match' : 'match'

				// Sourcify-compatible response format for completed jobs
				return context.json({
					isJobCompleted: true,
					verificationId,
					contract: {
						match: runtimeMatchStatus,
						creationMatch: creationMatchStatus,
						runtimeMatch: runtimeMatchStatus,
						chainId: String(v.chainId),
						address: Hex.fromBytes(new Uint8Array(v.address as ArrayBuffer)),
						verifiedAt: v.verifiedAt,
						matchId: String(v.matchId),
						name: v.contractName,
					},
				})
			}
		}

		return context.json(
			{
				customCode: 'not_found',
				message: `No verification job found for ID ${verificationId}`,
				errorId: globalThis.crypto.randomUUID(),
			},
			404,
		)
	} catch (error) {
		const { verificationId } = context.req.param()
		log
			.fromContext(context)
			.error('verification_status_check_failed', error, { verificationId })
		return context.json(
			{
				customCode: 'internal_error',
				message: 'An unexpected error occurred',
				errorId: globalThis.crypto.randomUUID(),
			},
			500,
		)
	}
})

export { runVerificationJob, verifyRoute }
