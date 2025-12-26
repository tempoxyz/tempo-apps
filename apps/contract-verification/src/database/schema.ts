import { sql } from 'drizzle-orm'
import * as p from 'drizzle-orm/sqlite-core'

// ============================================================================
// Helper for common audit columns
// ============================================================================

const auditColumns = () => ({
	createdAt: p.text('created_at').notNull().default(sql`(datetime('now'))`),
	updatedAt: p.text('updated_at').notNull().default(sql`(datetime('now'))`),
	/** SQLite lacks CURRENT_USER - set from application context */
	createdBy: p.text('created_by').notNull(),
	/** SQLite lacks CURRENT_USER - set from application context */
	updatedBy: p.text('updated_by').notNull(),
})

// ============================================================================
// code - Stores contract bytecode with content-addressed hashing
// ============================================================================

/**
 * PostgreSQL CHECK constraint (validate at app level):
 *   (code IS NOT NULL AND code_hash = digest(code, 'sha256')) OR
 *   (code IS NULL AND code_hash = '\x')
 */
export const codeTable = p.sqliteTable(
	'code',
	(s) => ({
		/** SHA-256 hash of the code (primary key) */
		codeHash: s.blob('code_hash').primaryKey(),
		...auditColumns(),
		/** Keccak-256 hash of the code */
		codeHashKeccak: s.blob('code_hash_keccak').notNull(),
		/** Contract bytecode (nullable - can be pruned) */
		code: s.blob('code'),
	}),
	(table) => [p.index('code_code_hash_keccak').on(table.codeHashKeccak)],
)

// ============================================================================
// sources - Stores source code files
// ============================================================================

/**
 * PostgreSQL CHECK constraint (validate at app level):
 *   source_hash = digest(content, 'sha256')
 */
export const sourcesTable = p.sqliteTable('sources', (s) => ({
	/** SHA-256 hash of the source content (primary key) */
	sourceHash: s.blob('source_hash').primaryKey(),
	/** Keccak-256 hash of the source content */
	sourceHashKeccak: s.blob('source_hash_keccak').notNull(),
	/** Source code content */
	content: s.text('content').notNull(),
	...auditColumns(),
}))

// ============================================================================
// contracts - Represents a contract by its creation/runtime code hashes
// ============================================================================

export const contractsTable = p.sqliteTable(
	'contracts',
	(s) => ({
		/** UUID primary key (generate with crypto.randomUUID()) */
		id: s.text('id').primaryKey(),
		...auditColumns(),
		/** FK to code.code_hash (creation bytecode) */
		creationCodeHash: s
			.blob('creation_code_hash')
			.references(() => codeTable.codeHash),
		/** FK to code.code_hash (runtime bytecode) */
		runtimeCodeHash: s
			.blob('runtime_code_hash')
			.notNull()
			.references(() => codeTable.codeHash),
	}),
	(table) => [
		p.index('contracts_creation_code_hash').on(table.creationCodeHash),
		p.index('contracts_runtime_code_hash').on(table.runtimeCodeHash),
		p
			.uniqueIndex('contracts_pseudo_pkey')
			.on(table.creationCodeHash, table.runtimeCodeHash),
	],
)

// ============================================================================
// contract_deployments - Links contracts to on-chain deployments
// ============================================================================

export const contractDeploymentsTable = p.sqliteTable(
	'contract_deployments',
	(s) => ({
		/** UUID primary key */
		id: s.text('id').primaryKey(),
		...auditColumns(),
		/** Chain ID (e.g., 1 for mainnet) */
		chainId: s.integer('chain_id').notNull(),
		/** Contract address (20 bytes) */
		address: s.blob('address').notNull(),
		/** Transaction hash of deployment */
		transactionHash: s.blob('transaction_hash'),
		/** Block number of deployment */
		blockNumber: s.integer('block_number'),
		/** Transaction index within block */
		transactionIndex: s.integer('transaction_index'),
		/** Deployer address */
		deployer: s.blob('deployer'),
		/** FK to contracts.id */
		contractId: s
			.text('contract_id')
			.notNull()
			.references(() => contractsTable.id),
	}),
	(table) => [
		p.index('contract_deployments_address').on(table.address),
		p.index('contract_deployments_contract_id').on(table.contractId),
		p
			.uniqueIndex('contract_deployments_pseudo_pkey')
			.on(
				table.chainId,
				table.address,
				table.transactionHash,
				table.contractId,
			),
	],
)

// ============================================================================
// compiled_contracts - Stores compilation results
// ============================================================================

export const compiledContractsTable = p.sqliteTable(
	'compiled_contracts',
	(s) => ({
		/** UUID primary key */
		id: s.text('id').primaryKey(),
		...auditColumns(),
		/** Compiler name (e.g., "solc") */
		compiler: s.text('compiler').notNull(),
		/** Compiler version (e.g., "0.8.19") */
		version: s.text('version').notNull(),
		/** Source language (e.g., "Solidity", "Vyper") */
		language: s.text('language').notNull(),
		/** Contract name */
		name: s.text('name').notNull(),
		/** Fully qualified name (e.g., "contracts/Token.sol:Token") */
		fullyQualifiedName: s.text('fully_qualified_name').notNull(),
		/** Compiler settings (JSON) */
		compilerSettings: s.text('compiler_settings').notNull(),
		/** Compilation artifacts - abi, userdoc, devdoc, sources, storageLayout (JSON) */
		compilationArtifacts: s.text('compilation_artifacts').notNull(),
		/** FK to code.code_hash (creation bytecode) */
		creationCodeHash: s
			.blob('creation_code_hash')
			.notNull()
			.references(() => codeTable.codeHash),
		/** Creation code artifacts - sourceMap, linkReferences, cborAuxdata (JSON) */
		creationCodeArtifacts: s.text('creation_code_artifacts').notNull(),
		/** FK to code.code_hash (runtime bytecode) */
		runtimeCodeHash: s
			.blob('runtime_code_hash')
			.notNull()
			.references(() => codeTable.codeHash),
		/** Runtime code artifacts - sourceMap, linkReferences, immutableReferences, cborAuxdata (JSON) */
		runtimeCodeArtifacts: s.text('runtime_code_artifacts').notNull(),
	}),
	(table) => [
		p
			.index('compiled_contracts_creation_code_hash')
			.on(table.creationCodeHash),
		p
			.index('compiled_contracts_runtime_code_hash')
			.on(table.runtimeCodeHash),
		p
			.uniqueIndex('compiled_contracts_pseudo_pkey')
			.on(
				table.compiler,
				table.version,
				table.language,
				table.creationCodeHash,
				table.runtimeCodeHash,
			),
	],
)

// ============================================================================
// compiled_contracts_sources - Links compilations to source files
// ============================================================================

export const compiledContractsSourcesTable = p.sqliteTable(
	'compiled_contracts_sources',
	(s) => ({
		/** UUID primary key */
		id: s.text('id').primaryKey(),
		/** FK to compiled_contracts.id */
		compilationId: s
			.text('compilation_id')
			.notNull()
			.references(() => compiledContractsTable.id),
		/** FK to sources.source_hash */
		sourceHash: s
			.blob('source_hash')
			.notNull()
			.references(() => sourcesTable.sourceHash),
		/** File path within compilation */
		path: s.text('path').notNull(),
	}),
	(table) => [
		p
			.index('compiled_contracts_sources_compilation_id')
			.on(table.compilationId),
		p.index('compiled_contracts_sources_source_hash').on(table.sourceHash),
		p
			.uniqueIndex('compiled_contracts_sources_pseudo_pkey')
			.on(table.compilationId, table.path),
	],
)

// ============================================================================
// signatures - Stores function/event/error signatures
// ============================================================================

export const signaturesTable = p.sqliteTable(
	'signatures',
	(s) => ({
		/** Full 32-byte signature hash (primary key) */
		signatureHash32: s.blob('signature_hash_32').primaryKey(),
		/** First 4 bytes of signature hash (for function selectors) - generated column */
		// Note: SQLite generated columns need raw SQL, handled at migration level
		/** Human-readable signature (e.g., "transfer(address,uint256)") */
		signature: s.text('signature').notNull(),
		createdAt: s.text('created_at').notNull().default(sql`(datetime('now'))`),
	}),
	(table) => [p.index('signatures_signature_idx').on(table.signature)],
)

// ============================================================================
// compiled_contracts_signatures - Links compilations to signatures
// ============================================================================

/** Signature type enum values */
export type SignatureType = 'function' | 'event' | 'error'

export const compiledContractsSignaturesTable = p.sqliteTable(
	'compiled_contracts_signatures',
	(s) => ({
		/** UUID primary key */
		id: s.text('id').primaryKey(),
		/** FK to compiled_contracts.id */
		compilationId: s
			.text('compilation_id')
			.notNull()
			.references(() => compiledContractsTable.id),
		/** FK to signatures.signature_hash_32 */
		signatureHash32: s
			.blob('signature_hash_32')
			.notNull()
			.references(() => signaturesTable.signatureHash32),
		/** Type: 'function', 'event', or 'error' */
		signatureType: s.text('signature_type').notNull().$type<SignatureType>(),
		createdAt: s.text('created_at').notNull().default(sql`(datetime('now'))`),
	}),
	(table) => [
		p
			.index('compiled_contracts_signatures_signature_idx')
			.on(table.signatureHash32),
		p
			.index('compiled_contracts_signatures_type_signature_idx')
			.on(table.signatureType, table.signatureHash32),
		p
			.uniqueIndex('compiled_contracts_signatures_pseudo_pkey')
			.on(table.compilationId, table.signatureHash32, table.signatureType),
	],
)

// ============================================================================
// verified_contracts - Links deployments to compilations with match info
// ============================================================================

export const verifiedContractsTable = p.sqliteTable(
	'verified_contracts',
	(s) => ({
		/** Auto-increment primary key */
		id: s.integer('id').primaryKey({ autoIncrement: true }),
		...auditColumns(),
		/** FK to contract_deployments.id */
		deploymentId: s
			.text('deployment_id')
			.notNull()
			.references(() => contractDeploymentsTable.id),
		/** FK to compiled_contracts.id */
		compilationId: s
			.text('compilation_id')
			.notNull()
			.references(() => compiledContractsTable.id),
		/** Whether creation code matched */
		creationMatch: s.integer('creation_match', { mode: 'boolean' }).notNull(),
		/** Creation match values (JSON) - constructor args, libraries, etc. */
		creationValues: s.text('creation_values'),
		/** Creation transformations applied (JSON) */
		creationTransformations: s.text('creation_transformations'),
		/** Whether creation metadata matched exactly */
		creationMetadataMatch: s.integer('creation_metadata_match', {
			mode: 'boolean',
		}),
		/** Whether runtime code matched */
		runtimeMatch: s.integer('runtime_match', { mode: 'boolean' }).notNull(),
		/** Runtime match values (JSON) - libraries, immutables, etc. */
		runtimeValues: s.text('runtime_values'),
		/** Runtime transformations applied (JSON) */
		runtimeTransformations: s.text('runtime_transformations'),
		/** Whether runtime metadata matched exactly */
		runtimeMetadataMatch: s.integer('runtime_metadata_match', {
			mode: 'boolean',
		}),
	}),
	(table) => [
		p.index('verified_contracts_deployment_id').on(table.deploymentId),
		p.index('verified_contracts_compilation_id').on(table.compilationId),
		p
			.uniqueIndex('verified_contracts_pseudo_pkey')
			.on(table.compilationId, table.deploymentId),
	],
)

// ============================================================================
// verification_jobs - Tracks verification job status
// ============================================================================

export const verificationJobsTable = p.sqliteTable(
	'verification_jobs',
	(s) => ({
		/** UUID primary key */
		id: s.text('id').primaryKey(),
		/** When verification started */
		startedAt: s.text('started_at').notNull().default(sql`(datetime('now'))`),
		/** When verification completed (null if still running) */
		completedAt: s.text('completed_at'),
		/** Chain ID */
		chainId: s.integer('chain_id').notNull(),
		/** Contract address being verified */
		contractAddress: s.blob('contract_address').notNull(),
		/** FK to verified_contracts.id (set on success) */
		verifiedContractId: s
			.integer('verified_contract_id')
			.references(() => verifiedContractsTable.id),
		/** Error code if verification failed */
		errorCode: s.text('error_code'),
		/** Error ID for tracking */
		errorId: s.text('error_id'),
		/** Error details (JSON) */
		errorData: s.text('error_data'),
		/** API endpoint that initiated verification */
		verificationEndpoint: s.text('verification_endpoint').notNull(),
		/** Hardware info for debugging */
		hardware: s.text('hardware'),
		/** Compilation time in milliseconds */
		compilationTime: s.integer('compilation_time'),
		/** External verification service results (JSON) */
		externalVerification: s.text('external_verification'),
	}),
	(table) => [
		p
			.index('verification_jobs_chain_id_address_idx')
			.on(table.chainId, table.contractAddress),
	],
)

// ============================================================================
// verification_jobs_ephemeral - Temporary data for verification jobs
// ============================================================================

export const verificationJobsEphemeralTable = p.sqliteTable(
	'verification_jobs_ephemeral',
	(s) => ({
		/** FK to verification_jobs.id (also primary key) */
		id: s
			.text('id')
			.primaryKey()
			.references(() => verificationJobsTable.id),
		/** Recompiled creation bytecode */
		recompiledCreationCode: s.blob('recompiled_creation_code'),
		/** Recompiled runtime bytecode */
		recompiledRuntimeCode: s.blob('recompiled_runtime_code'),
		/** On-chain creation bytecode */
		onchainCreationCode: s.blob('onchain_creation_code'),
		/** On-chain runtime bytecode */
		onchainRuntimeCode: s.blob('onchain_runtime_code'),
		/** Creation transaction hash */
		creationTransactionHash: s.blob('creation_transaction_hash'),
	}),
)
