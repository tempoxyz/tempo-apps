import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach } from 'vitest'

import * as DB from '#database/schema.ts'

const tables = [
	DB.verificationJobsTable,
	DB.verifiedContractsTable,
	DB.compiledContractsSignaturesTable,
	DB.compiledContractsSourcesTable,
	DB.nativeContractRevisionSourcesTable,
	DB.compiledContractsTable,
	DB.nativeContractRevisionsTable,
	DB.contractDeploymentsTable,
	DB.contractsTable,
	DB.nativeContractsTable,
	DB.signaturesTable,
	DB.sourcesTable,
	DB.codeTable,
] as const

beforeEach(async () => {
	await applyD1Migrations(env.CONTRACTS_DB, env.TEST_MIGRATIONS)

	const db = drizzle(env.CONTRACTS_DB)
	for (const table of tables) {
		await db.delete(table)
	}
})
