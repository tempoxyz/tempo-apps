import { Hex } from 'ox'
import { keccak256 } from 'viem'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import {
	sourcesTable,
	nativeContractsTable,
	nativeContractRevisionsTable,
	nativeContractRevisionSourcesTable,
} from '#database/schema.ts'
import {
	nativeContractsManifest,
	type NativeContractManifestEntry,
} from './manifest.ts'

type Database = Pick<
	BaseSQLiteDatabase<'async', unknown, Record<string, never>>,
	'insert'
>

export type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>

export type SeedNativeContractsOptions = {
	manifest?: readonly NativeContractManifestEntry[]
	fetch?: FetchLike
	auditUser?: string
}

export type SeedNativeContractsResult = {
	contracts: number
	revisions: number
	revisionSources: number
	uniqueSources: number
}

const defaultAuditUser = 'native-contracts-importer'

function encodeGitHubPath(path: string): string {
	return path
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/')
}

export function getGitHubRawUrl(
	repository: string,
	commit: string,
	path: string,
): string {
	return `https://raw.githubusercontent.com/${repository}/${commit}/${encodeGitHubPath(path)}`
}

async function fetchSourceFile(
	fetchImpl: FetchLike,
	repository: string,
	commit: string,
	path: string,
): Promise<string> {
	const response = await fetchImpl(getGitHubRawUrl(repository, commit, path), {
		headers: {
			accept: 'text/plain; charset=utf-8',
		},
	})

	if (!response.ok) {
		throw new Error(
			`Failed to fetch ${repository}@${commit}:${path} (${response.status} ${response.statusText})`,
		)
	}

	return response.text()
}

async function hashSourceContent(content: string): Promise<{
	sourceHash: Uint8Array
	sourceHashKeccak: Uint8Array
}> {
	const contentBytes = new TextEncoder().encode(content)
	return {
		sourceHash: new Uint8Array(
			await globalThis.crypto.subtle.digest('SHA-256', contentBytes),
		),
		sourceHashKeccak: Hex.toBytes(keccak256(Hex.fromBytes(contentBytes))),
	}
}

function buildNativeContractId(
	entry: NativeContractManifestEntry,
	chainId: number,
	address: `0x${string}`,
): string {
	return `native:${entry.id}:${chainId}:${address.toLowerCase()}`
}

function buildNativeContractRevisionId(
	nativeContractId: string,
	entry: NativeContractManifestEntry,
	activation: NativeContractManifestEntry['deployments'][number]['activation'],
): string {
	return [
		'revision',
		nativeContractId,
		entry.commit,
		activation.protocolVersion ?? 'null',
		String(activation.fromBlock ?? 0),
		String(activation.toBlock ?? 'open'),
	].join(':')
}

function buildRevisionSourceId(revisionId: string, path: string): string {
	return `revision-source:${revisionId}:${path}`
}

function validateManifestEntry(entry: NativeContractManifestEntry): void {
	const paths = new Set(entry.paths)
	for (const entrypoint of entry.entrypoints) {
		if (!paths.has(entrypoint)) {
			throw new Error(
				`Manifest entry ${entry.id} has entrypoint outside paths: ${entrypoint}`,
			)
		}
	}
	if (entry.deployments.length === 0) {
		throw new Error(
			`Manifest entry ${entry.id} must include at least one deployment`,
		)
	}
}

export async function seedNativeContracts(
	db: Database,
	options: SeedNativeContractsOptions = {},
): Promise<SeedNativeContractsResult> {
	const manifest = options.manifest ?? nativeContractsManifest
	const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
	const auditUser = options.auditUser ?? defaultAuditUser
	const sourceCache = new Map<string, Promise<string>>()
	const uniqueSourceHashes = new Set<string>()

	let [contracts, revisions, revisionSources] = [0, 0, 0]

	for (const entry of manifest) {
		validateManifestEntry(entry)

		const sourcesByPath = await Promise.all(
			entry.paths.map(async (path) => {
				const cacheKey = `${entry.repository}:${entry.commit}:${path}`
				const contentPromise =
					sourceCache.get(cacheKey) ??
					fetchSourceFile(fetchImpl, entry.repository, entry.commit, path)

				if (!sourceCache.has(cacheKey))
					sourceCache.set(cacheKey, contentPromise)

				const content = await contentPromise
				const hashes = await hashSourceContent(content)
				uniqueSourceHashes.add(Hex.fromBytes(hashes.sourceHash))

				await db
					.insert(sourcesTable)
					.values({
						sourceHash: hashes.sourceHash,
						sourceHashKeccak: hashes.sourceHashKeccak,
						content,
						createdBy: auditUser,
						updatedBy: auditUser,
					})
					.onConflictDoNothing()

				return {
					path,
					content,
					sourceHash: hashes.sourceHash,
				}
			}),
		)

		for (const deployment of entry.deployments) {
			const nativeContractId = buildNativeContractId(
				entry,
				deployment.chainId,
				deployment.address,
			)
			const revisionId = buildNativeContractRevisionId(
				nativeContractId,
				entry,
				deployment.activation,
			)

			await db
				.insert(nativeContractsTable)
				.values({
					id: nativeContractId,
					chainId: deployment.chainId,
					address: Hex.toBytes(deployment.address),
					name: entry.name,
					runtimeType: entry.runtimeType,
					language: entry.language,
					abiJson: JSON.stringify(entry.abi),
					docsUrl: ('docsUrl' in entry ? entry.docsUrl : undefined) ?? null,
					createdBy: auditUser,
					updatedBy: auditUser,
				})
				.onConflictDoUpdate({
					target: nativeContractsTable.id,
					set: {
						name: entry.name,
						runtimeType: entry.runtimeType,
						language: entry.language,
						abiJson: JSON.stringify(entry.abi),
						docsUrl: ('docsUrl' in entry ? entry.docsUrl : undefined) ?? null,
						updatedBy: auditUser,
					},
				})
			contracts += 1

			await db
				.insert(nativeContractRevisionsTable)
				.values({
					id: revisionId,
					nativeContractId,
					repo: entry.repository,
					commitSha: entry.commit,
					commitUrl: entry.commitUrl,
					protocolVersion: deployment.activation.protocolVersion,
					fromBlock: deployment.activation.fromBlock ?? 0,
					toBlock: deployment.activation.toBlock,
					sourceRoot: entry.sourceRoot,
					snapshotStatus: 'complete',
					createdBy: auditUser,
					updatedBy: auditUser,
				})
				.onConflictDoUpdate({
					target: nativeContractRevisionsTable.id,
					set: {
						repo: entry.repository,
						commitSha: entry.commit,
						commitUrl: entry.commitUrl,
						protocolVersion: deployment.activation.protocolVersion,
						fromBlock: deployment.activation.fromBlock ?? 0,
						toBlock: deployment.activation.toBlock,
						sourceRoot: entry.sourceRoot,
						snapshotStatus: 'complete',
						updatedBy: auditUser,
					},
				})
			revisions += 1

			for (const source of sourcesByPath) {
				await db
					.insert(nativeContractRevisionSourcesTable)
					.values({
						id: buildRevisionSourceId(revisionId, source.path),
						revisionId,
						sourceHash: source.sourceHash,
						path: source.path,
						isEntrypoint: entry.entrypoints.includes(source.path),
					})
					.onConflictDoUpdate({
						target: nativeContractRevisionSourcesTable.id,
						set: {
							sourceHash: source.sourceHash,
							path: source.path,
							isEntrypoint: entry.entrypoints.includes(source.path),
						},
					})
				revisionSources += 1
			}
		}
	}

	return {
		contracts,
		revisions,
		revisionSources,
		uniqueSources: uniqueSourceHashes.size,
	}
}
