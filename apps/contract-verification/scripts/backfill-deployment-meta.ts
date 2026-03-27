/**
 * Backfill deployment metadata for existing verified contracts.
 *
 * Finds all `contract_deployments` rows where `transaction_hash IS NULL`,
 * looks up the creation transaction via the chain's block explorer API,
 * and populates `transaction_hash`, `block_number`, `transaction_index`, and `deployer`.
 *
 * Usage:
 *   # Against local D1 (SQLite):
 *   CLOUDFLARE_D1_ENVIRONMENT=local bun scripts/backfill-deployment-meta.ts
 *
 *   # Against remote D1:
 *   bun scripts/backfill-deployment-meta.ts
 *
 *   # Dry run (no writes):
 *   DRY_RUN=1 bun scripts/backfill-deployment-meta.ts
 *
 * Requires env vars (for remote): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_D1_TOKEN
 */

import { createClient } from '@libsql/client'
import { Hex } from 'ox'
import NodeChildProcess from 'node:child_process'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DRY_RUN = process.env.DRY_RUN === '1'
const isLocal = process.env.CLOUDFLARE_D1_ENVIRONMENT === 'local'

/** Block explorer base URLs keyed by chain ID */
const EXPLORER_URLS: Record<number, string> = {
	4217: 'https://explore.tempo.xyz',
	42431: 'https://explore.moderato.tempo.xyz',
	31318: 'https://explore.devnet.tempo.xyz',
}

/** Delay between explorer API requests to avoid rate-limiting (ms) */
const REQUEST_DELAY_MS = 200

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

function getDbUrl(): string {
	if (isLocal) {
		return NodeChildProcess.execSync('/bin/bash scripts/local-d1.sh')
			.toString()
			.trim()
	}
	throw new Error(
		'Remote D1 access via this script requires a local SQLite copy or a D1 HTTP proxy. ' +
			'Set CLOUDFLARE_D1_ENVIRONMENT=local and use the local dev DB.',
	)
}

const db = createClient({ url: `file:${getDbUrl()}` })

// ---------------------------------------------------------------------------
// Explorer API helpers
// ---------------------------------------------------------------------------

type ExplorerAddressResponse = {
	creation_tx_hash?: string | null
	creator_address_hash?: string | null
	block_number_balance_updated_at?: number | null
}

async function fetchCreationTx(
	explorerUrl: string,
	address: string,
): Promise<{
	transactionHash: string
	deployer: string
} | null> {
	const url = `${explorerUrl}/api/v2/addresses/${address}`
	const response = await fetch(url, {
		headers: { Accept: 'application/json' },
	})
	if (!response.ok) {
		console.warn(
			`  Explorer API returned ${response.status} for ${address} at ${url}`,
		)
		return null
	}
	const data = (await response.json()) as ExplorerAddressResponse
	if (!data.creation_tx_hash || !data.creator_address_hash) {
		console.warn(`  No creation tx found for ${address}`)
		return null
	}
	return {
		transactionHash: data.creation_tx_hash,
		deployer: data.creator_address_hash,
	}
}

type ExplorerTxResponse = {
	hash: string
	block: number
	position: number
	from: { hash: string }
}

async function fetchTransactionDetails(
	explorerUrl: string,
	txHash: string,
): Promise<{
	blockNumber: number
	transactionIndex: number
} | null> {
	const url = `${explorerUrl}/api/v2/transactions/${txHash}`
	const response = await fetch(url, {
		headers: { Accept: 'application/json' },
	})
	if (!response.ok) {
		console.warn(`  Explorer API returned ${response.status} for tx ${txHash}`)
		return null
	}
	const data = (await response.json()) as ExplorerTxResponse
	return {
		blockNumber: data.block,
		transactionIndex: data.position,
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.log(`Backfill deployment metadata${DRY_RUN ? ' (DRY RUN)' : ''}\n`)

	// 1. Query all deployments with null transaction_hash
	const rows = await db.execute(
		'SELECT id, chain_id, address FROM contract_deployments WHERE transaction_hash IS NULL',
	)

	console.log(`Found ${rows.rows.length} deployments with missing metadata\n`)

	if (rows.rows.length === 0) {
		console.log('Nothing to do.')
		return
	}

	// 2. Group by chain_id
	const byChain = new Map<number, Array<{ id: string; address: string }>>()
	for (const row of rows.rows) {
		const chainId = row.chain_id as number
		const id = row.id as string
		// Address is stored as a blob (ArrayBuffer/Uint8Array)
		const addressBlob = row.address as ArrayBuffer | Uint8Array
		const addressHex = Hex.fromBytes(new Uint8Array(addressBlob))

		if (!byChain.has(chainId)) byChain.set(chainId, [])
		byChain.get(chainId)?.push({ id, address: addressHex })
	}

	let updated = 0
	let skipped = 0
	let failed = 0

	for (const [chainId, deployments] of byChain) {
		const explorerUrl = EXPLORER_URLS[chainId]
		if (!explorerUrl) {
			console.warn(
				`No explorer URL configured for chain ${chainId}, skipping ${deployments.length} deployments`,
			)
			skipped += deployments.length
			continue
		}

		console.log(
			`Chain ${chainId} (${explorerUrl}): ${deployments.length} deployments`,
		)

		for (const deployment of deployments) {
			try {
				// 3. Look up creation tx from explorer
				const creationInfo = await fetchCreationTx(
					explorerUrl,
					deployment.address,
				)
				if (!creationInfo) {
					skipped++
					continue
				}

				// Fetch full tx details for block number and index
				const txDetails = await fetchTransactionDetails(
					explorerUrl,
					creationInfo.transactionHash,
				)
				if (!txDetails) {
					skipped++
					continue
				}

				const txHashBytes = Hex.toBytes(
					creationInfo.transactionHash as `0x${string}`,
				)
				const deployerBytes = Hex.toBytes(
					creationInfo.deployer as `0x${string}`,
				)

				console.log(
					`  ${deployment.address}: tx=${creationInfo.transactionHash} block=${txDetails.blockNumber} deployer=${creationInfo.deployer}`,
				)

				if (!DRY_RUN) {
					// 4. Update the row
					await db.execute({
						sql: `UPDATE contract_deployments
						       SET transaction_hash = ?,
						           block_number = ?,
						           transaction_index = ?,
						           deployer = ?,
						           updated_at = datetime('now'),
						           updated_by = 'backfill-script'
						       WHERE id = ?`,
						args: [
							txHashBytes,
							txDetails.blockNumber,
							txDetails.transactionIndex,
							deployerBytes,
							deployment.id,
						],
					})
				}

				updated++
			} catch (error) {
				console.error(
					`  Error processing ${deployment.address}:`,
					error instanceof Error ? error.message : error,
				)
				failed++
			}

			// Rate limit
			await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS))
		}
	}

	console.log(
		`\nDone. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`,
	)
}

main().catch(console.error)
