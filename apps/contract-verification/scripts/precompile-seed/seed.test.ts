import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { assert, describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { getGitHubRawUrl, seedNativeContracts, type FetchLike } from './seed.ts'
import {
	nativeContractsManifest,
	type NativeContractManifestEntry,
} from './manifest.ts'

describe('seedNativeContracts', () => {
	it('upgrades an existing activation and replaces its source links without changing other activations', async () => {
		const db = drizzle(env.CONTRACTS_DB, { schema: DB })
		const template = nativeContractsManifest[0]
		assert(template)
		const deployment = template.deployments[0]
		assert(deployment)
		const previous: NativeContractManifestEntry = {
			...template,
			commit: 'old-commit',
			commitUrl: 'https://github.com/tempoxyz/tempo/tree/old-commit',
			paths: ['mod.rs', 'removed.rs'],
			entrypoints: ['mod.rs'],
			deployments: [deployment],
		}
		const otherActivation: NativeContractManifestEntry = {
			...previous,
			deployments: previous.deployments.map((deployment) => ({
				...deployment,
				activation: { ...deployment.activation, fromBlock: 100 },
			})),
		}
		const next: NativeContractManifestEntry = {
			...previous,
			commit: 'new-commit',
			commitUrl: 'https://github.com/tempoxyz/tempo/tree/new-commit',
			paths: ['mod.rs', 'added.rs'],
			entrypoints: ['added.rs'],
		}
		const fetchMock: FetchLike = async (input) => new Response(`// ${input}`)
		await seedNativeContracts(db, {
			manifest: [previous, otherActivation],
			fetch: fetchMock,
		})
		const before = await db.select().from(DB.nativeContractRevisionsTable)
		const oldRevision = before.find((row) => row.fromBlock === 0)
		const otherRevision = before.find((row) => row.fromBlock === 100)
		assert(oldRevision && otherRevision)
		const otherLinks = await db
			.select()
			.from(DB.nativeContractRevisionSourcesTable)
			.where(
				eq(DB.nativeContractRevisionSourcesTable.revisionId, otherRevision.id),
			)

		for (let run = 0; run < 2; run++) {
			await seedNativeContracts(db, { manifest: [next], fetch: fetchMock })
			const revisions = await db.select().from(DB.nativeContractRevisionsTable)
			expect(revisions).toHaveLength(2)
			expect(revisions.find((row) => row.fromBlock === 0)).toMatchObject({
				id: oldRevision.id,
				commitSha: next.commit,
				commitUrl: next.commitUrl,
			})
			expect(revisions.find((row) => row.fromBlock === 100)).toEqual(
				otherRevision,
			)
			expect(
				await db
					.select()
					.from(DB.nativeContractRevisionSourcesTable)
					.where(
						eq(
							DB.nativeContractRevisionSourcesTable.revisionId,
							otherRevision.id,
						),
					),
			).toEqual(otherLinks)
			const links = await db
				.select({
					path: DB.nativeContractRevisionSourcesTable.path,
					isEntrypoint: DB.nativeContractRevisionSourcesTable.isEntrypoint,
					content: DB.sourcesTable.content,
				})
				.from(DB.nativeContractRevisionSourcesTable)
				.innerJoin(
					DB.sourcesTable,
					eq(
						DB.sourcesTable.sourceHash,
						DB.nativeContractRevisionSourcesTable.sourceHash,
					),
				)
				.where(
					eq(DB.nativeContractRevisionSourcesTable.revisionId, oldRevision.id),
				)
				.orderBy(DB.nativeContractRevisionSourcesTable.path)
			expect(links).toEqual(
				['added.rs', 'mod.rs'].map((path) => ({
					path,
					isEntrypoint: path === 'added.rs',
					content: `// ${getGitHubRawUrl(next.repository, next.commit, path)}`,
				})),
			)
		}

		const revisionsBeforeFailure = await db
			.select()
			.from(DB.nativeContractRevisionsTable)
		const linksBeforeFailure = await db
			.select()
			.from(DB.nativeContractRevisionSourcesTable)
		// A failed link insert must roll back the metadata and link replacement together.
		await expect(
			seedNativeContracts(db, {
				manifest: [
					{ ...next, commit: 'failed-commit', paths: ['added.rs', 'added.rs'] },
				],
				fetch: fetchMock,
			}),
		).rejects.toThrow()
		expect(await db.select().from(DB.nativeContractRevisionsTable)).toEqual(
			revisionsBeforeFailure,
		)
		expect(
			await db.select().from(DB.nativeContractRevisionSourcesTable),
		).toEqual(linksBeforeFailure)
	})

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
		for (const entry of nativeContractsManifest) {
			for (const deployment of entry.deployments) {
				expect(nativeRevisions).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							nativeContractId: `native:${entry.id}:${deployment.chainId}:${deployment.address.toLowerCase()}`,
							repo: entry.repository,
							commitSha: entry.commit,
						}),
					]),
				)
			}
		}

		const nativeRevisionSources = await db
			.select()
			.from(DB.nativeContractRevisionSourcesTable)
		expect(nativeRevisionSources).toHaveLength(expectedRevisionSources)

		const sources = await db.select().from(DB.sourcesTable)
		expect(sources).toHaveLength(expectedUniqueSources)
	})
})
