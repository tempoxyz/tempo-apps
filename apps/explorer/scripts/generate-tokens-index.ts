import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as ABIS from '../src/lib/abis.ts'

loadLocalEnv()

export const SUPPORTED_CHAINS = [31318, 42431, 4217] as const
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number]

export type Token = [address: string, symbol: string, name: string]
type TokenCreatedRow = {
	token: string
	symbol: string
	name: string
}

const NATIVE_TOKENS: Token[] = [
	['0x20c0000000000000000000000000000000000000', 'pathUSD', 'pathUSD'],
	['0x20c0000000000000000000000000000000000001', 'AlphaUSD', 'AlphaUSD'],
	['0x20c0000000000000000000000000000000000002', 'BetaUSD', 'BetaUSD'],
	['0x20c0000000000000000000000000000000000003', 'ThetaUSD', 'ThetaUSD'],
]
const NATIVE_TOKEN_ADDRESSES = new Set(
	NATIVE_TOKENS.map(([address]) => address),
)

export async function fetchTokensForChain(
	chainId: SupportedChain,
): Promise<Token[]> {
	if (chainId === 31318) return getSnapshotTokens(chainId)

	const { tempoQueryBuilder } = await import(
		'../src/lib/server/tempo-queries-provider.ts'
	)
	const rows = (await tempoQueryBuilder(chainId)
		.withSignatures([ABIS.getTokenCreatedEvent(chainId)])
		.selectFrom('tokencreated')
		.select(['token', 'symbol', 'name'])
		.orderBy('block_timestamp', 'desc')
		.execute()) as TokenCreatedRow[]

	return rows.map(
		(row): Token => [
			String(row.token).toLowerCase(),
			String(row.symbol),
			String(row.name),
		],
	)
}

export function formatTokensIndex(tokens: Token[]): string {
	const lines = tokens.map((token) => `\t${JSON.stringify(token)}`)
	return `[\n${lines.join(',\n')}\n]\n`
}

export function parseRequestedChains(
	arg: string | undefined,
): SupportedChain[] {
	if (arg === 'all') return [...SUPPORTED_CHAINS]

	const chainId = Number(arg) as SupportedChain
	if (SUPPORTED_CHAINS.includes(chainId)) return [chainId]

	throw new Error(getUsageMessage())
}

export async function generateForChain(chainId: SupportedChain) {
	assertTidxAuthConfigured()
	if (chainId === 31318)
		console.warn(
			'Devnet chain 31318 is not available through live tidx queries; reusing the checked-in snapshot.',
		)
	console.log(`Fetching tokens for chain ${chainId} from tidx…`)

	const fetchedTokens = await fetchTokensForChain(chainId)
	console.log(`Found ${fetchedTokens.length} tokens.`)

	const tokens = [...NATIVE_TOKENS, ...fetchedTokens]
	console.log(`Total including native: ${tokens.length}.`)

	const outputPath = getOutputPath(chainId)

	writeFileSync(outputPath, formatTokensIndex(tokens))
	console.log(`Written to ${outputPath}\n`)
}

export async function main(
	args: string[] = process.argv.slice(2),
): Promise<number> {
	try {
		const chains = parseRequestedChains(args[0])
		await Promise.all(chains.map(generateForChain))
		return 0
	} catch (error) {
		if (error instanceof Error && error.message === getUsageMessage()) {
			console.error(error.message)
			return 1
		}

		console.error('Error:', error)
		return 1
	}
}

function getUsageMessage(): string {
	return [
		'Usage: generate-tokens-index.ts <chainId | all>',
		`Supported chains: ${SUPPORTED_CHAINS.join(', ')}`,
	].join('\n')
}

function getOutputPath(chainId: SupportedChain): string {
	return resolve(
		import.meta.dirname,
		`../src/data/tokens-index-${chainId}.json`,
	)
}

function getSnapshotTokens(chainId: SupportedChain): Token[] {
	const raw = readFileSync(getOutputPath(chainId), 'utf8')
	const tokens = JSON.parse(raw) as Token[]
	return tokens.filter(([address]) => !NATIVE_TOKEN_ADDRESSES.has(address))
}

function loadLocalEnv(): void {
	try {
		process.loadEnvFile?.(resolve(import.meta.dirname, '../.env'))
	} catch {
		// Tests and clean environments may not have a local .env file.
	}
}

function assertTidxAuthConfigured(): void {
	if (!process.env.TIDX_BASIC_AUTH)
		throw new Error('TIDX_BASIC_AUTH environment variable is required')
}

function isDirectExecution(metaUrl: string): boolean {
	const entrypoint = process.argv[1]
	return Boolean(entrypoint) && pathToFileURL(entrypoint).href === metaUrl
}

if (isDirectExecution(import.meta.url)) {
	main().then((exitCode) => {
		if (exitCode !== 0) process.exit(exitCode)
	})
}
