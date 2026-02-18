import * as ABIS from '#lib/abis'

type QueryEngine = 'postgres' | 'clickhouse'

type QueryParams = {
	chainId: number
	sql: string
	signature?: string | undefined
}

type QueryResponse = {
	columns: string[]
	rows: unknown[][]
	row_count: number
	engine: QueryEngine
	query_time_ms: number
	ok: boolean
}

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'
const TRANSFER_AMOUNT_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 amount)'
const MAX_BALANCE_SCAN = 10_000
const MAX_TX_COUNT_SCAN = 100_000

export type SortDirection = 'asc' | 'desc'

type AddressDirectionParams = {
	address: string
	chainId: number
	includeSent: boolean
	includeReceived: boolean
}

export type HashRow = { hash: `0x${string}`; block_num: bigint }

export type TxDataRow = {
	hash: `0x${string}`
	block_num: bigint
	from: string
	to: string | null
	value: bigint
	input: `0x${string}`
	nonce: bigint
	gas: bigint
	gas_price: bigint
	type: bigint
}

function getBaseUrl(): string {
	const tidxUrl = process.env.TIDX_URL?.trim()
	if (!tidxUrl) {
		throw new Error('TIDX_URL is not configured')
	}
	return tidxUrl.replace(/\/$/, '')
}

function addressFilter(params: AddressDirectionParams): string {
	if (params.includeSent && params.includeReceived) {
		return `("from" = '${params.address}' OR "to" = '${params.address}')`
	}

	if (params.includeSent) {
		return `"from" = '${params.address}'`
	}

	return `"to" = '${params.address}'`
}

function toHex(value: unknown): `0x${string}` {
	const hex = String(value)
	return (hex.startsWith('0x') ? hex : `0x${hex}`) as `0x${string}`
}

function quote(value: string): string {
	return `'${value.replaceAll("'", "''")}'`
}

function quoteList(values: string[]): string {
	return values.map((value) => quote(value)).join(', ')
}

function normalizeSignature(signature: string): string {
	return signature.replace(/^event\s+/, '')
}

export async function tidxQuery(params: QueryParams): Promise<QueryResponse> {
	const url = new URL('/query', getBaseUrl())
	url.searchParams.set('chainId', String(params.chainId))
	url.searchParams.set('sql', params.sql)

	if (params.signature) {
		url.searchParams.set('signature', normalizeSignature(params.signature))
	}

	const headers = new Headers()
	const tidxBasicAuth = process.env.TIDX_BASIC_AUTH?.trim()
	if (tidxBasicAuth) {
		headers.set('Authorization', `Basic ${btoa(tidxBasicAuth)}`)
	}

	const response = await fetch(url, { headers })
	if (!response.ok) {
		const errorBody = await response.text().catch(() => '')
		throw new Error(`TIDX query failed (${response.status}): ${errorBody}`)
	}

	const data = (await response.json()) as QueryResponse
	if (!data.ok) {
		throw new Error('TIDX query failed')
	}

	return data
}

export async function fetchLatestBlockNumberFromTidx(
	chainId: number,
): Promise<bigint | null> {
	const result = await tidxQuery({
		chainId,
		sql: 'SELECT num FROM blocks ORDER BY num DESC LIMIT 1',
	})

	const firstRow = result.rows[0]
	const blockNum = firstRow?.[0]
	if (blockNum === undefined || blockNum === null) return null

	return BigInt(blockNum as string | number | bigint)
}

export async function fetchAddressDirectTxHashes(
	params: AddressDirectionParams & {
		sortDirection: SortDirection
		limit: number
	},
): Promise<HashRow[]> {
	const result = await tidxQuery({
		chainId: params.chainId,
		sql: `
			SELECT hash, block_num
			FROM txs
			WHERE ${addressFilter(params)}
			ORDER BY block_num ${params.sortDirection}, hash ${params.sortDirection}
			LIMIT ${params.limit}
		`,
	})

	return result.rows.map((row) => ({
		hash: toHex(row[0]),
		block_num: BigInt(row[1] as string | number | bigint),
	}))
}

export async function fetchAddressTransferHashes(
	params: AddressDirectionParams & {
		sortDirection: SortDirection
		limit: number
	},
): Promise<Array<{ tx_hash: `0x${string}`; block_num: bigint }>> {
	const result = await tidxQuery({
		chainId: params.chainId,
		signature: TRANSFER_SIGNATURE,
		sql: `
			SELECT DISTINCT tx_hash, block_num
			FROM Transfer
			WHERE ${addressFilter(params)}
			ORDER BY block_num ${params.sortDirection}, tx_hash ${params.sortDirection}
			LIMIT ${params.limit}
		`,
	})

	return result.rows.map((row) => ({
		tx_hash: toHex(row[0]),
		block_num: BigInt(row[1] as string | number | bigint),
	}))
}

export async function fetchAddressTransferEmittedHashes(params: {
	address: string
	chainId: number
	sortDirection: SortDirection
	limit: number
}): Promise<Array<{ tx_hash: `0x${string}`; block_num: bigint }>> {
	const result = await tidxQuery({
		chainId: params.chainId,
		signature: TRANSFER_SIGNATURE,
		sql: `
			SELECT DISTINCT tx_hash, block_num
			FROM Transfer
			WHERE address = '${params.address}'
			ORDER BY block_num ${params.sortDirection}, tx_hash ${params.sortDirection}
			LIMIT ${params.limit}
		`,
	})

	return result.rows.map((row) => ({
		tx_hash: toHex(row[0]),
		block_num: BigInt(row[1] as string | number | bigint),
	}))
}

export async function fetchContractCreationTxCandidates(
	chainId: number,
	creationBlock: bigint,
): Promise<Array<{ hash: `0x${string}`; block_num: bigint }>> {
	const result = await tidxQuery({
		chainId,
		sql: `
			SELECT hash, block_num
			FROM txs
			WHERE "to" = '0x0000000000000000000000000000000000000000'
			AND block_num = ${creationBlock.toString()}
		`,
	})

	return result.rows.map((row) => ({
		hash: toHex(row[0]),
		block_num: BigInt(row[1] as string | number | bigint),
	}))
}

export async function fetchTxDataByHashes(
	chainId: number,
	hashes: Array<`0x${string}`>,
): Promise<TxDataRow[]> {
	if (hashes.length === 0) return []

	const hashList = hashes.map((hash) => `'${hash}'`).join(', ')
	const result = await tidxQuery({
		chainId,
		sql: `
			SELECT
				hash,
				block_num,
				"from",
				"to",
				value,
				input,
				nonce,
				gas_limit AS gas,
				max_fee_per_gas AS gas_price,
				type
			FROM txs
			WHERE hash IN (${hashList})
		`,
	})

	return result.rows.map((row) => ({
		hash: toHex(row[0]),
		block_num: BigInt(row[1] as string | number | bigint),
		from: String(row[2]),
		to: row[3] ? String(row[3]) : null,
		value: BigInt(row[4] as string | number | bigint),
		input: toHex(row[5]),
		nonce: BigInt(row[6] as string | number | bigint),
		gas: BigInt(row[7] as string | number | bigint),
		gas_price: BigInt(row[8] as string | number | bigint),
		type: BigInt(row[9] as string | number | bigint),
	}))
}

export async function fetchAddressTransferBalances(
	address: string,
	chainId: number,
): Promise<
	Array<{ token: string; received: string | number; sent: string | number }>
> {
	const queryFor = (signature: string, amountColumn: 'amount' | 'tokens') =>
		tidxQuery({
			chainId,
			signature,
			sql: `
				SELECT
					address,
					"from",
					"to",
					${amountColumn}
				FROM Transfer
				WHERE "from" = ${quote(address)} OR "to" = ${quote(address)}
				LIMIT ${MAX_BALANCE_SCAN}
			`,
		})

	const [amountResult, tokensResult] = await Promise.all([
		queryFor(TRANSFER_AMOUNT_SIGNATURE, 'amount').catch(() => null),
		queryFor(TRANSFER_SIGNATURE, 'tokens').catch(() => null),
	])

	const merged = new Map<
		string,
		{ token: string; received: bigint; sent: bigint }
	>()
	const addressLower = address.toLowerCase()

	for (const source of [amountResult, tokensResult]) {
		if (!source) continue
		for (const row of source.rows) {
			const token = String(row[0])
			const tokenLower = token.toLowerCase()
			const from = String(row[1]).toLowerCase()
			const to = String(row[2]).toLowerCase()
			const amount = BigInt((row[3] as string | number | bigint | null) ?? 0)

			let received = 0n
			let sent = 0n
			if (to === addressLower) received = amount
			if (from === addressLower) sent = amount

			const current = merged.get(tokenLower)
			if (current) {
				current.received += received
				current.sent += sent
				continue
			}

			merged.set(tokenLower, {
				token,
				received,
				sent,
			})
		}
	}

	return [...merged.values()].map((value) => ({
		token: value.token,
		received: value.received.toString(),
		sent: value.sent.toString(),
	}))
}

export async function fetchTokenCreatedMetadata(
	chainId: number,
	tokens: string[],
): Promise<
	Array<{ token: string; name: string; symbol: string; currency: string }>
> {
	if (tokens.length === 0) return []

	const signature = ABIS.getTokenCreatedEvent(chainId)
	const result = await tidxQuery({
		chainId,
		signature,
		sql: `
			SELECT token, name, symbol, currency
			FROM TokenCreated
			WHERE token IN (${quoteList(tokens)})
		`,
	})

	return result.rows.map((row) => ({
		token: String(row[0]),
		name: String(row[1] ?? ''),
		symbol: String(row[2] ?? ''),
		currency: String(row[3] ?? ''),
	}))
}

export async function fetchAddressTransfersForValue(
	address: string,
	chainId: number,
	limit: number,
): Promise<
	Array<{ address: string; from: string; to: string; tokens: string | number }>
> {
	const result = await tidxQuery({
		chainId,
		signature: TRANSFER_SIGNATURE,
		sql: `
			SELECT address, "from", "to", tokens
			FROM Transfer
			WHERE "from" = ${quote(address)} OR "to" = ${quote(address)}
			LIMIT ${limit}
		`,
	})

	return result.rows.map((row) => ({
		address: String(row[0]),
		from: String(row[1]),
		to: String(row[2]),
		tokens: row[3] as string | number,
	}))
}

export async function fetchAddressTxAggregate(
	address: string,
	chainId: number,
): Promise<{
	count?: number
	latestTxsBlockTimestamp?: unknown
	oldestTxsBlockTimestamp?: unknown
}> {
	const filter = `"from" = ${quote(address)} OR "to" = ${quote(address)}`

	const [latestResult, oldestResult, countResult] = await Promise.all([
		tidxQuery({
			chainId,
			sql: `
				SELECT block_timestamp
				FROM txs
				WHERE ${filter}
				ORDER BY block_num DESC, hash DESC
				LIMIT 1
			`,
		}),
		tidxQuery({
			chainId,
			sql: `
				SELECT block_timestamp
				FROM txs
				WHERE ${filter}
				ORDER BY block_num ASC, hash ASC
				LIMIT 1
			`,
		}),
		tidxQuery({
			chainId,
			sql: `
				SELECT hash
				FROM txs
				WHERE ${filter}
				LIMIT ${MAX_TX_COUNT_SCAN}
			`,
		}),
	])

	return {
		count: countResult.row_count,
		latestTxsBlockTimestamp: latestResult.rows[0]?.[0],
		oldestTxsBlockTimestamp: oldestResult.rows[0]?.[0],
	}
}
