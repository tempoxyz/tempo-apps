import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as ABIS from '../src/lib/abis'

const indexSupplyEndpoint = 'https://api.tempo.xyz/indexer/query'
const chainId = 42429

const eventSignature = ABIS.getTokenCreatedEvent(chainId).replace(/^event /, '')

const query =
	`SELECT token, symbol, name FROM tokencreated ` +
	`WHERE chain = ${chainId} ORDER BY block_timestamp DESC`

type Token = [address: string, symbol: string, name: string]

// native tokens (not created via factory)
const nativeTokens: Token[] = [
	['0x20c0000000000000000000000000000000000000', 'pathUSD', 'pathUSD'],
	['0x20c0000000000000000000000000000000000001', 'AlphaUSD', 'AlphaUSD'],
	['0x20c0000000000000000000000000000000000002', 'BetaUSD', 'BetaUSD'],
	['0x20c0000000000000000000000000000000000003', 'ThetaUSD', 'ThetaUSD'],
]

async function fetchAllTokens(): Promise<Token[]> {
	const apiKey = process.env.INDEXER_API_KEY
	if (!apiKey)
		throw new Error('INDEXER_API_KEY environment variable is required')

	const url = new URL(indexSupplyEndpoint)
	url.searchParams.set('api-key', apiKey)

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify([
			{ cursor: `${chainId}-0`, signatures: [eventSignature], query },
		]),
	})

	if (!response.ok)
		throw new Error(
			`IndexSupply API error (${response.status}): ${await response.text()}`,
		)

	const data = (await response.json()) as Array<{ rows?: unknown[][] }>
	const [result] = data

	if (!result?.rows)
		throw new Error('Unexpected response format from IndexSupply')

	return result.rows.map(
		(row): Token => [
			String(row[0]).toLowerCase(), // address
			String(row[1]), // symbol
			String(row[2]), // name
		],
	)
}

async function main() {
	console.log('Fetching tokens from IndexSupply…')

	const fetchedTokens = await fetchAllTokens()
	console.log(`Found ${fetchedTokens.length} tokens.`)

	const tokens = [...nativeTokens, ...fetchedTokens]
	console.log(`Total including native: ${tokens.length}.`)

	const outputPath = resolve(
		import.meta.dirname,
		'../src/data/tokens-index.json',
	)

	const lines = tokens.map((t) => `\t${JSON.stringify(t)}`)
	writeFileSync(outputPath, `[\n${lines.join(',\n')}\n]\n`)
	console.log(`Written to ${outputPath}`)
}

main().catch((error) => {
	console.error('Error:', error)
	process.exit(1)
})
