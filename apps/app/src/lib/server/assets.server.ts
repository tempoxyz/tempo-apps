import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import { decodeAbiParameters } from 'viem'
import { TOKEN_CREATED_EVENT } from '#lib/abis'

const TIP20_DECIMALS = 6
const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV

// TODO: Remove this hardcoded USD assumption once proper price oracle is implemented
// DONOTUSE is a test faucet token that we treat as USD-denominated for demo purposes
const HARDCODED_USD_TOKENS = new Set([
	'0x20c000000000000000000000033abb6ac7d235e5', // DONOTUSE (presto faucet token)
])

async function fetchTokenMetadataViaRpc(
	token: string,
): Promise<{ name: string; symbol: string } | null> {
	const rpcUrl =
		TEMPO_ENV === 'moderato'
			? 'https://rpc.tempo.xyz'
			: 'https://rpc.presto.tempo.xyz'

	const { env } = await import('cloudflare:workers')
	const auth = env.PRESTO_RPC_AUTH as string | undefined
	const headers: Record<string, string> = { 'Content-Type': 'application/json' }
	if (auth) {
		headers.Authorization = `Basic ${btoa(auth)}`
	}

	try {
		const response = await fetch(rpcUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify([
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_call',
					params: [{ to: token, data: '0x06fdde03' }, 'latest'],
				},
				{
					jsonrpc: '2.0',
					id: 2,
					method: 'eth_call',
					params: [{ to: token, data: '0x95d89b41' }, 'latest'],
				},
			]),
		})
		if (!response.ok) return null

		const results = (await response.json()) as Array<{
			id: number
			result?: `0x${string}`
			error?: unknown
		}>

		const nameResult = results.find((r) => r.id === 1)?.result
		const symbolResult = results.find((r) => r.id === 2)?.result

		if (!nameResult || !symbolResult) return null

		const decodeString = (hex: `0x${string}`) => {
			try {
				const [value] = decodeAbiParameters([{ type: 'string' }], hex)
				return value
			} catch {
				return ''
			}
		}

		return {
			name: decodeString(nameResult),
			symbol: decodeString(symbolResult),
		}
	} catch {
		return null
	}
}

async function getIndexSupply() {
	let apiKey: string | undefined
	try {
		const { env } = await import('cloudflare:workers')
		apiKey = env.INDEXER_API_KEY as string | undefined
	} catch {
		apiKey = process.env.INDEXER_API_KEY ?? import.meta.env.INDEXER_API_KEY
	}
	console.log(
		'[getIndexSupply] apiKey present:',
		!!apiKey,
		'length:',
		apiKey?.length,
	)
	const IS = IDX.IndexSupply.create({ apiKey })
	return { IS, QB: IDX.QueryBuilder.from(IS) }
}

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 amount)'

export type AssetData = {
	address: Address.Address
	metadata:
		| { name?: string; symbol?: string; decimals?: number; priceUsd?: number }
		| undefined
	balance: string | undefined
	valueUsd: number | undefined
}

export const fetchAssets = createServerFn({ method: 'GET' })
	.inputValidator((input: { address: string }) => input)
	.handler(async ({ data }): Promise<AssetData[] | null> => {
		try {
			const address = data.address as Address.Address
			// Get chain ID from runtime env for server functions
			let chainId: number
			try {
				const { env } = await import('cloudflare:workers')
				const tempoEnv = env.VITE_TEMPO_ENV as string | undefined
				chainId =
					tempoEnv === 'moderato' ? 42431 : tempoEnv === 'devnet' ? 42430 : 4217
			} catch {
				// Local dev fallback - default to mainnet (presto)
				chainId =
					TEMPO_ENV === 'moderato'
						? 42431
						: TEMPO_ENV === 'devnet'
							? 42430
							: 4217
			}

			const { QB } = await getIndexSupply()
			const qb = QB.withSignatures([TRANSFER_SIGNATURE])

			console.log('[fetchAssets] chainId:', chainId, 'address:', address)

			const incomingQuery = qb
				.selectFrom('transfer')
				.select((eb: any) => [
					eb.ref('address').as('token'),
					eb.fn.sum('amount').as('received'),
				])
				.where('chain', '=', chainId)
				.where('to', '=', address)
				.groupBy('address')

			const outgoingQuery = qb
				.selectFrom('transfer')
				.select((eb: any) => [
					eb.ref('address').as('token'),
					eb.fn.sum('amount').as('sent'),
				])
				.where('chain', '=', chainId)
				.where('from', '=', address)
				.groupBy('address')

			const tokenCreatedQuery = QB.withSignatures([TOKEN_CREATED_EVENT])
				.selectFrom('tokencreated')
				.select(['token', 'name', 'symbol', 'currency'])
				.where('chain', '=', chainId as never)

			const [incomingResult, outgoingResult, tokenCreatedResult] =
				await Promise.all([
					incomingQuery.execute(),
					outgoingQuery.execute(),
					tokenCreatedQuery.execute(),
				])

			console.log(
				'[fetchAssets] incoming:',
				incomingResult.length,
				'outgoing:',
				outgoingResult.length,
				'tokens:',
				tokenCreatedResult.length,
			)

			const tokenMetadata = new Map<
				string,
				{ name: string; symbol: string; currency: string }
			>()
			for (const row of tokenCreatedResult) {
				tokenMetadata.set(String(row.token).toLowerCase(), {
					name: String(row.name),
					symbol: String(row.symbol),
					currency: String(row.currency),
				})
			}

			const balances = new Map<string, bigint>()

			for (const row of incomingResult) {
				const token = String(row.token).toLowerCase()
				const received = BigInt(row.received)
				balances.set(token, (balances.get(token) ?? 0n) + received)
			}

			for (const row of outgoingResult) {
				const token = String(row.token).toLowerCase()
				const sent = BigInt(row.sent)
				balances.set(token, (balances.get(token) ?? 0n) - sent)
			}

			// Include all tokens from user's balance, plus all created tokens (with 0 balance if not held)
			const allTokens = new Map<
				string,
				{
					token: Address.Address
					balance: bigint
					metadata: ReturnType<typeof tokenMetadata.get>
				}
			>()

			// Add user's balances
			for (const [token, balance] of balances.entries()) {
				if (balance !== 0n) {
					allTokens.set(token, {
						token: token as Address.Address,
						balance,
						metadata: tokenMetadata.get(token),
					})
				}
			}

			// Add all created tokens with 0 balance if not already in user's assets
			for (const [token, metadata] of tokenMetadata.entries()) {
				if (!allTokens.has(token)) {
					allTokens.set(token, {
						token: token as Address.Address,
						balance: 0n,
						metadata,
					})
				}
			}

			const tokensArray = [...allTokens.values()]

			if (tokensArray.length === 0) return []

			const MAX_TOKENS = 50

			const tokensMissingMetadata = tokensArray
				.slice(0, MAX_TOKENS)
				.filter((t) => !t.metadata)
				.map((t) => t.token)

			if (tokensMissingMetadata.length > 0) {
				const rpcMetadataResults = await Promise.all(
					tokensMissingMetadata.map(async (token) => {
						const metadata = await fetchTokenMetadataViaRpc(token)
						return { token, metadata }
					}),
				)

				for (const { token, metadata } of rpcMetadataResults) {
					if (metadata) {
						tokenMetadata.set(token.toLowerCase(), {
							name: metadata.name,
							symbol: metadata.symbol,
							currency: '',
						})
					}
				}
			}

			const assets: AssetData[] = tokensArray
				.slice(0, MAX_TOKENS)
				.map((row) => {
					const metadata = row.metadata ?? tokenMetadata.get(row.token)
					// TODO: Replace hardcoded USD check with proper price oracle
					const isUsd =
						metadata?.currency === 'USD' ||
						HARDCODED_USD_TOKENS.has(row.token.toLowerCase())
					const valueUsd = isUsd
						? Number(row.balance) / 10 ** TIP20_DECIMALS
						: undefined

					return {
						address: row.token,
						metadata: metadata
							? {
									name: metadata.name,
									symbol: metadata.symbol,
									decimals: TIP20_DECIMALS,
								}
							: undefined,
						balance: row.balance.toString(),
						valueUsd,
					}
				})
				.sort((a, b) => {
					// Sort by balance first (non-zero balances first)
					const aHasBalance = a.balance && a.balance !== '0'
					const bHasBalance = b.balance && b.balance !== '0'
					if (aHasBalance && !bHasBalance) return -1
					if (!aHasBalance && bHasBalance) return 1

					const aIsUsd = a.valueUsd !== undefined
					const bIsUsd = b.valueUsd !== undefined

					if (aIsUsd && bIsUsd) {
						return (b.valueUsd ?? 0) - (a.valueUsd ?? 0)
					}

					if (aIsUsd) return -1
					if (bIsUsd) return 1

					return Number(BigInt(b.balance ?? '0') - BigInt(a.balance ?? '0'))
				})

			return assets
		} catch (error) {
			console.error('fetchAssets error:', error)
			return null
		}
	})
