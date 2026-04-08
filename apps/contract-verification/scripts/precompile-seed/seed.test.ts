import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { getGitHubRawUrl, seedNativeContracts, type FetchLike } from './seed.ts'
import { nativeContractsManifest } from './manifest.ts'

describe('seedNativeContracts', () => {
	it('imports manifest-backed native contracts and is idempotent', async () => {
		const db = drizzle(env.CONTRACTS_DB, { schema: DB })
		const sourceResponses = new Map<string, string>(
			nativeContractsManifest.flatMap((entry) =>
				entry.paths.map((path) => [
					getGitHubRawUrl(entry.repository, entry.commit, path),
					`// ${entry.id}:${path}`,
				]),
			),
		)

		const fetchMock: FetchLike = async (input) => {
			const url = String(input)
			const content = sourceResponses.get(url)
			if (!content) {
				return new Response('not found', {
					status: 404,
					statusText: 'Not Found',
				})
			}

			return new Response(content, { status: 200 })
		}

		const firstRun = await seedNativeContracts(db, {
			fetch: fetchMock,
			auditUser: 'test-native-seed',
		})
		const expectedContracts = nativeContractsManifest.reduce(
			(total, entry) => total + entry.deployments.length,
			0,
		)
		const expectedRevisionSources = nativeContractsManifest.reduce(
			(total, entry) => total + entry.deployments.length * entry.paths.length,
			0,
		)
		const expectedUniqueSources = new Set(
			nativeContractsManifest.flatMap((entry) => entry.paths),
		).size
		expect(firstRun).toEqual({
			contracts: expectedContracts,
			revisions: expectedContracts,
			revisionSources: expectedRevisionSources,
			uniqueSources: expectedUniqueSources,
		})

		const secondRun = await seedNativeContracts(db, {
			fetch: fetchMock,
			auditUser: 'test-native-seed',
		})
		expect(secondRun).toEqual(firstRun)

		const nativeContracts = await db.select().from(DB.nativeContractsTable)
		expect(nativeContracts).toHaveLength(expectedContracts)
		expect(
			nativeContracts.some((row) => row.name === 'Validator Config V2'),
		).toBe(true)
		expect(nativeContracts.some((row) => row.name === 'TIP Fee Manager')).toBe(
			true,
		)

		const nativeRevisions = await db
			.select()
			.from(DB.nativeContractRevisionsTable)
		expect(nativeRevisions).toHaveLength(expectedContracts)
		expect(
			nativeRevisions.every(
				(row) =>
					row.repo === nativeContractsManifest[0]?.repository &&
					row.commitSha === nativeContractsManifest[0]?.commit,
			),
		).toBe(true)

		const nativeRevisionSources = await db
			.select()
			.from(DB.nativeContractRevisionSourcesTable)
		expect(nativeRevisionSources).toHaveLength(expectedRevisionSources)

		const sources = await db.select().from(DB.sourcesTable)
		expect(sources).toHaveLength(expectedUniqueSources)
	})
})
