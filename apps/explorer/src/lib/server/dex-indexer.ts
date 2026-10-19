import {
	type Address,
	BaseError,
	ContractFunctionExecutionError,
	type ContractFunctionParameters,
	type MulticallReturnType,
	toEventSelector,
} from 'viem'
import { Addresses } from 'viem/tempo'
import { Abis } from '#lib/abis'
import { append, type DexPoolToken } from '#lib/dex-pools'
import { tempoApi, tempoApiUrl } from '#lib/server/env'
import { getChainBackend } from '#lib/server/network'
import { getBatchedClient } from '#wagmi.config'

/** Calls per multicall; see `readContracts`. */
const READ_CHUNK = 50

/** Switches kept per base; only recent ones affect what is shown. */
const MAX_SWITCHES = 50

const quoteTokenUpdate = toEventSelector('QuoteTokenUpdate(address,address)')
const hexAddress = /^0x[0-9a-f]{40}$/

export const dex = {
	address: Addresses.stablecoinDex,
	abi: Abis.stablecoinDex,
} as const

export type Row = Record<string, unknown>

/**
 * Runs SQL against the chain's indexer: a devnet or zone build's own tidx
 * when it has one, otherwise the Tempo API's. `signature` exposes a decoded
 * event table.
 */
export async function indexer(
	chainId: number,
	sql: string,
	signature?: string,
): Promise<Row[]> {
	const backend = getChainBackend(chainId, 'tidx')
	const url = new URL(`${backend?.url ?? `${tempoApiUrl}/v1/indexer`}/query`)
	url.search = new URLSearchParams({
		sql,
		chainId: String(chainId),
		engine: 'clickhouse',
		...(signature ? { signature } : {}),
	}).toString()
	const response = await fetch(url, {
		headers: {
			Accept: 'application/json',
			...(backend?.headers ?? tempoApi.headers),
		},
	})
	const result = (await response.json().catch(() => null)) as {
		ok?: boolean
		columns?: string[]
		rows?: unknown[][]
		error?: string
	} | null
	const columns = result?.columns
	if (!response.ok || !result?.ok || !columns || !result.rows)
		throw new Error(
			`Indexer query failed (${response.status}): ${result?.error ?? 'no result'}`,
		)
	return result.rows.map((values) =>
		Object.fromEntries(columns.map((name, i) => [name, values[i]])),
	)
}

/** ClickHouse `DateTime` literal; the indexer rejects ISO-Z strings. */
export function sqlTime(ms: number): string {
	return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}

/** Indexer values are interpolated into SQL, so only lowercase hex passes. */
export function addressOf(value: unknown): Address | undefined {
	const text = String(value).toLowerCase()
	return hexAddress.test(text) ? (text as Address) : undefined
}

export function list(values: Iterable<string>): string {
	return [...values].map((value) => `'${value}'`).join(', ')
}

/** Each base's quote-token switches, newest first, capped per base. */
export async function readQuoteSwitches(
	chainId: number,
	bases: Iterable<Address>,
): Promise<Map<Address, { quote: Address; at: number }[]>> {
	const rows = await indexer(
		chainId,
		`SELECT address, topic2, toUnixTimestamp(block_timestamp) AS ts FROM logs
		WHERE selector = '${quoteTokenUpdate}' AND address IN (${list(bases)})
		ORDER BY block_num DESC, log_idx DESC LIMIT ${MAX_SWITCHES} BY address`,
	)
	const switches = new Map<Address, { quote: Address; at: number }[]>()
	for (const row of rows) {
		const base = addressOf(row.address)
		const quote = addressOf(`0x${String(row.topic2).slice(-40)}`)
		if (!base || !quote) continue
		append(switches, base, { quote, at: Number(row.ts) })
	}
	return switches
}

export type TokenState = {
	token: DexPoolToken
	quoteToken: Address
	nextQuoteToken: Address
}

/** Lowercased verified token addresses; empty when the registry is down. */
export function readVerified(chainId: number): Promise<Set<string>> {
	return import('#lib/server/verified-tokens').then((module) =>
		module.getVerifiedTokenAddresses(chainId),
	)
}

/** Symbol, decimals and quote tokens, flagged against the verified list. */
export async function readTokens(
	chainId: number,
	addresses: readonly Address[],
	blockNumber: bigint,
): Promise<Map<Address, TokenState>> {
	const [results, verified] = await Promise.all([
		readContracts(
			addresses.flatMap((address) =>
				(['symbol', 'decimals', 'quoteToken', 'nextQuoteToken'] as const).map(
					(functionName) => ({ address, abi: Abis.tip20, functionName }),
				),
			),
			blockNumber,
		),
		readVerified(chainId),
	])
	const tokens = new Map<Address, TokenState>()
	addresses.forEach((address, index) => {
		const [symbol, decimals, quoteToken, nextQuoteToken] = results.slice(
			index * 4,
			index * 4 + 4,
		)
		if (symbol?.status !== 'success' || decimals?.status !== 'success') return
		const lower = (result: typeof quoteToken) =>
			result?.status === 'success'
				? (String(result.result).toLowerCase() as Address)
				: Addresses.pathUsd
		tokens.set(address, {
			token: {
				address,
				symbol: String(symbol.result),
				decimals: Number(decimals.result),
				// Fail closed: an unreachable registry flags nothing as verified.
				verified: verified.has(address),
			},
			quoteToken: lower(quoteToken),
			nextQuoteToken: lower(nextQuoteToken),
		})
	})
	return tokens
}

/**
 * Deployless multicall sends every call in one creation payload and viem
 * does not chunk it, so a large read is split before the RPC rejects it.
 * A chunk shares one call's gas, and a tick level with a long order queue
 * can exhaust it; such a chunk is retried as separate calls.
 */
export async function readContracts<
	const contracts extends readonly ContractFunctionParameters[],
>(
	contracts: contracts,
	blockNumber: bigint,
): Promise<MulticallReturnType<contracts>> {
	const client = getBatchedClient()
	const chunks: ContractFunctionParameters[][] = []
	for (let index = 0; index < contracts.length; index += READ_CHUNK)
		chunks.push(contracts.slice(index, index + READ_CHUNK))
	const results = await Promise.all(
		chunks.map(async (chunk) => {
			const results = await client.multicall({
				contracts: chunk,
				allowFailure: true,
				deployless: true,
				blockNumber,
			})
			if (!results.every((result) => aggregateFailed(result.error)))
				return results
			return Promise.all(
				chunk.map((contract) =>
					client.readContract({ ...contract, blockNumber }).then(
						(result) => ({ status: 'success' as const, result }),
						(error: Error) => ({ status: 'failure' as const, error }),
					),
				),
			)
		}),
	)
	return results.flat() as MulticallReturnType<contracts>
}

/** The multicall itself failed, rather than one of its calls. */
function aggregateFailed(error: Error | undefined): boolean {
	return (
		error instanceof BaseError &&
		Boolean(
			error.walk(
				(cause) =>
					cause instanceof ContractFunctionExecutionError &&
					cause.functionName === 'aggregate3',
			),
		)
	)
}
