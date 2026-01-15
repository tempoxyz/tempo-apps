import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { encode } from 'uqr'
import {
	createClient,
	createPublicClient,
	decodeAbiParameters,
	erc20Abi,
	encodeFunctionData,
	formatUnits,
	http,
	parseUnits,
} from 'viem'
import { sendTransaction } from 'viem/actions'
import { Account as TempoAccount } from 'viem/tempo'
import { PublicKey } from 'ox'
import {
	useAccount,
	useConnectorClient,
	useDisconnect,
	useWriteContract,
	useWaitForTransactionReceipt,
} from 'wagmi'
import { getTempoChain } from '#wagmi.config'
import {
	TxDescription,
	parseKnownEvents,
	preferredEventsFilter,
	getPerspectiveEvent,
	type KnownEvent,
	type GetTokenMetadataFn,
} from '#comps/activity'
import { AddFunds } from '#comps/AddFunds'
import { Layout } from '#comps/Layout'
import { TokenIcon } from '#comps/TokenIcon'
import { Section } from '#comps/Section'
import { AccessKeysSection, getAccessKeyEmoji } from '#comps/AccessKeysSection'
import {
	AccessKeysProvider,
	useSignableAccessKeys,
	type AccessKeyData,
} from '#lib/access-keys-context'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import { fetchAssets, type AssetData } from '#lib/server/assets.server'
import { useActivitySummary, type ActivityType } from '#lib/activity-context'
import { LottoNumber } from '#comps/LottoNumber'
import {
	Settings,
	SETTINGS_VIEW_TITLES,
	type SettingsView,
} from '#comps/Settings'
import CopyIcon from '~icons/lucide/copy'
import ExternalLinkIcon from '~icons/lucide/external-link'
import CheckIcon from '~icons/lucide/check'
import SendIcon from '~icons/lucide/send'
import EyeIcon from '~icons/lucide/eye'
import EyeOffIcon from '~icons/lucide/eye-off'

import ChevronDownIcon from '~icons/lucide/chevron-down'

import ReceiptIcon from '~icons/lucide/receipt'
import BoxIcon from '~icons/lucide/box'
import XIcon from '~icons/lucide/x'

import SearchIcon from '~icons/lucide/search'
import LogOutIcon from '~icons/lucide/log-out'
import LogInIcon from '~icons/lucide/log-in'
import DropletIcon from '~icons/lucide/droplet'
import PlayIcon from '~icons/lucide/play'
import RefreshCwIcon from '~icons/lucide/refresh-cw'
import { useTranslation } from 'react-i18next'
import i18n, { isRtl } from '#lib/i18n'
import { useAnnounce, LiveRegion, useFocusTrap, useEscapeKey } from '#lib/a11y'

// Tokens that can be funded via the faucet
const FAUCET_TOKEN_ADDRESSES = new Set([
	'0x20c000000000000000000000033abb6ac7d235e5', // DONOTUSE
])

// Default faucet token data to inject when user has no assets
// TODO: Remove priceUsd: 1 assumption once proper price oracle is implemented
const FAUCET_TOKEN_DEFAULTS: AssetData[] = [
	{
		address: '0x20c000000000000000000000033abb6ac7d235e5' as `0x${string}`,
		metadata: {
			name: 'DONOTUSE',
			symbol: 'DONOTUSE',
			decimals: 6,
			priceUsd: 1,
		},
		balance: '0',
		valueUsd: 0,
	},
]

const faucetFundAddress = createServerFn({ method: 'POST' })
	.inputValidator((data: { address: string }) => data)
	.handler(async ({ data }) => {
		const { address } = data
		// Use cloudflare:workers env for Cloudflare Workers runtime
		const { env } = await import('cloudflare:workers')
		const auth = env.PRESTO_RPC_AUTH as string | undefined
		if (!auth) {
			return { success: false as const, error: 'Auth not configured' }
		}

		try {
			const res = await fetch('https://rpc.presto.tempo.xyz', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Basic ${btoa(auth)}`,
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tempo_fundAddress',
					params: [address],
				}),
			})

			if (!res.ok) {
				return { success: false as const, error: `HTTP ${res.status}` }
			}

			const result = (await res.json()) as {
				result?: unknown
				error?: { message: string }
			}
			if (result.error) {
				return { success: false as const, error: result.error.message }
			}
			return { success: true as const }
		} catch (e) {
			return { success: false as const, error: String(e) }
		}
	})

type ApiTransaction = {
	hash: string
	from: string
	to: string | null
	value: string
	blockNumber: string
	timestamp?: string
}

// Client-side env (for non-server code)
const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV

// Helper to get tempo env from Cloudflare Workers env (for server functions)
async function getTempoEnv(): Promise<string | undefined> {
	try {
		const { env } = await import('cloudflare:workers')
		return env.VITE_TEMPO_ENV as string | undefined
	} catch {
		return TEMPO_ENV
	}
}

function getRpcUrl(tempoEnv: string | undefined): string {
	// Default to mainnet (presto) RPC, only use moderato RPC for explicit moderato env
	return tempoEnv === 'moderato'
		? 'https://rpc.tempo.xyz'
		: 'https://rpc.presto.tempo.xyz'
}

function shouldUseAuth(tempoEnv: string | undefined): boolean {
	// Use auth for mainnet (presto) and devnet, not for moderato
	return tempoEnv !== 'moderato'
}

type RpcLog = {
	address: `0x${string}`
	topics: `0x${string}`[]
	data: `0x${string}`
	blockNumber: string
	transactionHash: string
	transactionIndex: string
	blockHash: string
	logIndex: string
	removed: boolean
}

type RpcTransactionReceipt = {
	transactionHash: string
	from: `0x${string}`
	to: `0x${string}` | null
	logs: RpcLog[]
	status: string
	blockNumber: string
	blockHash: string
	gasUsed: string
	effectiveGasPrice: string
	cumulativeGasUsed: string
	type: string
	contractAddress: `0x${string}` | null
}

const fetchTransactionReceipts = createServerFn({ method: 'POST' })
	.inputValidator((data: { hashes: string[] }) => data)
	.handler(async ({ data }) => {
		const { hashes } = data
		const tempoEnv = await getTempoEnv()
		const rpcUrl = getRpcUrl(tempoEnv)

		const { env } = await import('cloudflare:workers')
		const auth = env.PRESTO_RPC_AUTH as string | undefined
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (auth && shouldUseAuth(tempoEnv)) {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		// Batch all receipt requests in a single RPC call
		const batchRequest = hashes.map((hash, i) => ({
			jsonrpc: '2.0',
			id: i + 1,
			method: 'eth_getTransactionReceipt',
			params: [hash],
		}))

		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(batchRequest),
			})
			if (!response.ok) {
				return { receipts: hashes.map((hash) => ({ hash, receipt: null })) }
			}
			const results = (await response.json()) as Array<{
				id: number
				result?: RpcTransactionReceipt
			}>

			// Map results back to hashes by id
			const receipts = hashes.map((hash, i) => {
				const result = results.find((r) => r.id === i + 1)
				return { hash, receipt: result?.result ?? null }
			})
			return { receipts }
		} catch {
			return { receipts: hashes.map((hash) => ({ hash, receipt: null })) }
		}
	})

const fetchBlockTimestamps = createServerFn({ method: 'POST' })
	.inputValidator((data: { blockNumbers: string[] }) => data)
	.handler(async ({ data }) => {
		const { blockNumbers } = data
		if (blockNumbers.length === 0) return { timestamps: {} }

		const tempoEnv = await getTempoEnv()
		const rpcUrl = getRpcUrl(tempoEnv)

		const { env } = await import('cloudflare:workers')
		const auth = env.PRESTO_RPC_AUTH as string | undefined
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (auth && shouldUseAuth(tempoEnv)) {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		try {
			const batchRequest = blockNumbers.map((blockNum, i) => ({
				jsonrpc: '2.0',
				id: i + 1,
				method: 'eth_getBlockByNumber',
				params: [blockNum, false],
			}))

			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(batchRequest),
			})

			if (!response.ok) return { timestamps: {} }

			const results = (await response.json()) as Array<{
				id: number
				result?: { timestamp?: string }
			}>

			const timestamps: Record<string, number> = {}
			for (let i = 0; i < blockNumbers.length; i++) {
				const result = results.find((r) => r.id === i + 1)
				if (result?.result?.timestamp) {
					timestamps[blockNumbers[i]] =
						Number.parseInt(result.result.timestamp, 16) * 1000
				}
			}
			return { timestamps }
		} catch {
			return { timestamps: {} }
		}
	})

const fetchBlockData = createServerFn({ method: 'GET' })
	.inputValidator((data: { fromBlock: string; count: number }) => data)
	.handler(async ({ data }) => {
		const { fromBlock, count } = data
		const tempoEnv = await getTempoEnv()
		const rpcUrl = getRpcUrl(tempoEnv)

		const { env } = await import('cloudflare:workers')
		const auth = env.PRESTO_RPC_AUTH as string | undefined
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (auth && shouldUseAuth(tempoEnv)) {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		const startBlock = BigInt(fromBlock)
		const requests = []
		for (let i = 0; i < count; i++) {
			const blockNum = startBlock - BigInt(i)
			if (blockNum > 0n) {
				requests.push({
					jsonrpc: '2.0',
					id: i + 1,
					method: 'eth_getBlockByNumber',
					params: [`0x${blockNum.toString(16)}`, false],
				})
			}
		}

		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(requests),
			})
			if (response.ok) {
				const results = (await response.json()) as Array<{
					id: number
					result?: { number: string; transactions: string[] }
				}>
				const blocks: Array<{ blockNumber: string; txCount: number }> = []
				for (const r of results) {
					if (r.result) {
						blocks.push({
							blockNumber: r.result.number,
							txCount: r.result.transactions?.length ?? 0,
						})
					}
				}
				return { blocks }
			}
			return { blocks: [] }
		} catch {
			return { blocks: [] }
		}
	})

const fetchCurrentBlockNumber = createServerFn({ method: 'GET' }).handler(
	async () => {
		const tempoEnv = await getTempoEnv()
		const rpcUrl = getRpcUrl(tempoEnv)

		const { env } = await import('cloudflare:workers')
		const auth = env.PRESTO_RPC_AUTH as string | undefined
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (auth && shouldUseAuth(tempoEnv)) {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_blockNumber',
					params: [],
				}),
			})
			if (response.ok) {
				const json = (await response.json()) as { result?: string }
				if (json.result) {
					return { blockNumber: json.result }
				}
			}
			return { blockNumber: null }
		} catch {
			return { blockNumber: null }
		}
	},
)

const fetchTransactionsFromExplorer = createServerFn({ method: 'GET' })
	.inputValidator((data: { address: string }) => data)
	.handler(async ({ data }) => {
		const { address } = data
		const tempoEnv = await getTempoEnv()
		const explorerUrl =
			tempoEnv === 'presto'
				? 'https://explore.presto.tempo.xyz'
				: 'https://explore.mainnet.tempo.xyz'

		const { env } = await import('cloudflare:workers')
		const auth = env.PRESTO_RPC_AUTH as string | undefined
		const headers: Record<string, string> = {}
		if (auth) {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		try {
			const response = await fetch(
				`${explorerUrl}/api/address/${address}?include=all&limit=50`,
				{ headers },
			)
			if (!response.ok) {
				return {
					transactions: [] as ApiTransaction[],
					error: `HTTP ${response.status}`,
				}
			}
			const json = (await response.json()) as {
				transactions?: ApiTransaction[]
				error?: string | null
			}
			return {
				transactions: json.transactions ?? [],
				error: json.error ?? null,
			}
		} catch (e) {
			return { transactions: [] as ApiTransaction[], error: String(e) }
		}
	})

const fetchBlockWithReceipts = createServerFn({ method: 'GET' })
	.inputValidator((data: { blockNumber: string }) => data)
	.handler(async ({ data }) => {
		const { blockNumber } = data
		const tempoEnv = await getTempoEnv()
		const rpcUrl = getRpcUrl(tempoEnv)

		let auth: string | undefined
		try {
			const { env } = await import('cloudflare:workers')
			auth = env.PRESTO_RPC_AUTH as string | undefined
		} catch {
			// Not in Cloudflare Workers environment
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (auth && shouldUseAuth(tempoEnv)) {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		try {
			const blockHex = `0x${BigInt(blockNumber).toString(16)}`

			// First get block to get tx hashes
			const blockRes = await fetch(rpcUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_getBlockByNumber',
					params: [blockHex, true],
				}),
			})
			if (!blockRes.ok) {
				return {
					receipts: [] as RpcTransactionReceipt[],
					timestamp: undefined,
					error: `HTTP ${blockRes.status}`,
				}
			}
			const blockJson = (await blockRes.json()) as {
				result?: {
					transactions?: Array<{ hash: string }>
					timestamp?: string
				}
			}
			const txHashes =
				blockJson.result?.transactions?.map((tx) => tx.hash) ?? []
			const timestamp = blockJson.result?.timestamp
				? Number.parseInt(blockJson.result.timestamp, 16) * 1000
				: undefined

			if (txHashes.length === 0) {
				return { receipts: [], timestamp, error: null }
			}

			// Batch fetch all receipts in single request
			const batchRequest = txHashes.map((hash, i) => ({
				jsonrpc: '2.0',
				id: i + 1,
				method: 'eth_getTransactionReceipt',
				params: [hash],
			}))

			const receiptsRes = await fetch(rpcUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(batchRequest),
			})
			if (!receiptsRes.ok) {
				return { receipts: [], timestamp, error: `HTTP ${receiptsRes.status}` }
			}
			const receiptsJson = (await receiptsRes.json()) as Array<{
				id: number
				result?: RpcTransactionReceipt
			}>

			const receipts = txHashes
				.map((_, i) => receiptsJson.find((r) => r.id === i + 1)?.result)
				.filter((r): r is RpcTransactionReceipt => r !== undefined)

			return { receipts, timestamp, error: null }
		} catch (e) {
			return {
				receipts: [] as RpcTransactionReceipt[],
				timestamp: undefined,
				error: String(e),
			}
		}
	})

const fetchTokenMetadata = createServerFn({ method: 'POST' })
	.inputValidator((data: { addresses: string[] }) => data)
	.handler(async ({ data }) => {
		const { addresses } = data
		if (addresses.length === 0) return { tokens: {} }

		const tempoEnv = await getTempoEnv()
		const rpcUrl = getRpcUrl(tempoEnv)

		let auth: string | undefined
		try {
			const { env } = await import('cloudflare:workers')
			auth = env.PRESTO_RPC_AUTH as string | undefined
		} catch {
			// Not in Cloudflare Workers environment
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (auth && shouldUseAuth(tempoEnv)) {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		try {
			// Batch call for name() and symbol() for each token
			const batchRequest = addresses.flatMap((addr, i) => [
				{
					jsonrpc: '2.0',
					id: i * 2 + 1,
					method: 'eth_call',
					params: [{ to: addr, data: '0x06fdde03' }, 'latest'], // name()
				},
				{
					jsonrpc: '2.0',
					id: i * 2 + 2,
					method: 'eth_call',
					params: [{ to: addr, data: '0x95d89b41' }, 'latest'], // symbol()
				},
			])

			const res = await fetch(rpcUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(batchRequest),
			})
			if (!res.ok) return { tokens: {} }

			const results = (await res.json()) as Array<{
				id: number
				result?: `0x${string}`
			}>

			const decodeString = (hex: `0x${string}` | undefined): string => {
				if (!hex || hex === '0x') return ''
				try {
					const [value] = decodeAbiParameters([{ type: 'string' }], hex)
					return value
				} catch {
					return ''
				}
			}

			const tokens: Record<
				string,
				{ name: string; symbol: string; decimals: number }
			> = {}
			for (let i = 0; i < addresses.length; i++) {
				const nameResult = results.find((r) => r.id === i * 2 + 1)?.result
				const symbolResult = results.find((r) => r.id === i * 2 + 2)?.result
				const name = decodeString(nameResult)
				const symbol = decodeString(symbolResult)
				if (symbol) {
					tokens[addresses[i].toLowerCase()] = { name, symbol, decimals: 6 }
				}
			}

			return { tokens }
		} catch {
			return { tokens: {} }
		}
	})

type ActivityItem = {
	hash: string
	events: KnownEvent[]
	timestamp?: number
	blockNumber?: bigint
}

function convertRpcReceiptToViemReceipt(
	rpcReceipt: RpcTransactionReceipt,
): import('viem').TransactionReceipt {
	return {
		transactionHash: rpcReceipt.transactionHash as `0x${string}`,
		from: rpcReceipt.from,
		to: rpcReceipt.to,
		logs: rpcReceipt.logs.map((log) => ({
			address: log.address,
			topics:
				log.topics.length > 0
					? (log.topics as [`0x${string}`, ...`0x${string}`[]])
					: ([] as unknown as [`0x${string}`, ...`0x${string}`[]]),
			data: log.data,
			blockNumber: BigInt(log.blockNumber),
			transactionHash: log.transactionHash as `0x${string}`,
			transactionIndex: Number.parseInt(log.transactionIndex, 16),
			blockHash: log.blockHash as `0x${string}`,
			logIndex: Number.parseInt(log.logIndex, 16),
			removed: log.removed,
		})),
		status: rpcReceipt.status === '0x1' ? 'success' : 'reverted',
		blockNumber: BigInt(rpcReceipt.blockNumber),
		blockHash: rpcReceipt.blockHash as `0x${string}`,
		gasUsed: BigInt(rpcReceipt.gasUsed),
		effectiveGasPrice: BigInt(rpcReceipt.effectiveGasPrice),
		cumulativeGasUsed: BigInt(rpcReceipt.cumulativeGasUsed),
		type: rpcReceipt.type as '0x0' | '0x1' | '0x2',
		contractAddress: rpcReceipt.contractAddress,
		transactionIndex: 0,
		logsBloom: '0x' as `0x${string}`,
		root: undefined,
	}
}

async function fetchTransactions(
	address: Address.Address,
	tokenMetadataMap: Map<Address.Address, { decimals: number; symbol: string }>,
): Promise<ActivityItem[]> {
	try {
		const result = await fetchTransactionsFromExplorer({ data: { address } })

		if (result.error || result.transactions.length === 0) {
			return []
		}

		const txData = result.transactions.slice(0, 50) as Array<{
			hash: string
			timestamp?: string
		}>
		const hashes = txData.map((tx) => tx.hash)

		const receiptsResult = await fetchTransactionReceipts({ data: { hashes } })

		const getTokenMetadata: GetTokenMetadataFn = (tokenAddress) => {
			return tokenMetadataMap.get(tokenAddress)
		}

		// Collect unique block numbers to fetch timestamps
		const blockNumbers = new Set<string>()
		for (const { receipt } of receiptsResult.receipts) {
			if (receipt) blockNumbers.add(receipt.blockNumber)
		}

		// Fetch block timestamps
		const blockTimestamps = new Map<string, number>()
		if (blockNumbers.size > 0) {
			try {
				const timestampsResult = await fetchBlockTimestamps({
					data: { blockNumbers: Array.from(blockNumbers) },
				})
				for (const [blockNum, ts] of Object.entries(
					timestampsResult.timestamps,
				)) {
					blockTimestamps.set(blockNum, ts)
				}
			} catch {
				// Continue without timestamps if fetch fails
			}
		}

		const items: ActivityItem[] = []
		for (const { hash, receipt: rpcReceipt } of receiptsResult.receipts) {
			if (!rpcReceipt) continue
			try {
				const receipt = convertRpcReceiptToViemReceipt(rpcReceipt)
				const events = parseKnownEvents(receipt, {
					getTokenMetadata,
					viewer: address,
				})
				const txInfo = txData.find((tx) => tx.hash === hash)
				// Timestamp from explorer API (Unix seconds) or block timestamp
				const timestamp = txInfo?.timestamp
					? Number(txInfo.timestamp) * 1000
					: blockTimestamps.get(rpcReceipt.blockNumber)
				const blockNumber = BigInt(rpcReceipt.blockNumber)
				items.push({ hash, events, timestamp, blockNumber })
			} catch {
				// Skip malformed receipts
			}
		}

		return items
	} catch {
		return []
	}
}

type AddressSearchParams = {
	test?: boolean
	sendTo?: string
	token?: string
}

export const Route = createFileRoute('/_layout/$address')({
	component: AddressView,
	validateSearch: (search: Record<string, unknown>): AddressSearchParams => ({
		test: 'test' in search ? true : undefined,
		sendTo: typeof search.sendTo === 'string' ? search.sendTo : undefined,
		token: typeof search.token === 'string' ? search.token : undefined,
	}),
	loader: async ({ params }) => {
		const assets = await fetchAssets({ data: { address: params.address } })

		const tokenMetadataMap = new Map<
			Address.Address,
			{ decimals: number; symbol: string }
		>()
		for (const asset of assets ?? []) {
			if (asset.metadata?.decimals !== undefined && asset.metadata?.symbol) {
				tokenMetadataMap.set(asset.address, {
					decimals: asset.metadata.decimals,
					symbol: asset.metadata.symbol,
				})
			}
		}

		const activity = await fetchTransactions(
			params.address as Address.Address,
			tokenMetadataMap,
		)
		return { assets: assets ?? [], activity }
	},
})

function eventTypeToActivityType(eventType: string): ActivityType {
	const type = eventType.toLowerCase()
	if (type.includes('send') || type.includes('transfer')) return 'send'
	if (type.includes('receive')) return 'received'
	if (type.includes('swap') || type.includes('exchange')) return 'swap'
	if (type.includes('mint')) return 'mint'
	if (type.includes('burn')) return 'burn'
	if (type.includes('approve') || type.includes('approval')) return 'approve'
	return 'unknown'
}

function AddressView() {
	const { address } = Route.useParams()
	const { assets: initialAssets, activity: initialActivity } =
		Route.useLoaderData()
	const { copy, notifying } = useCopy()
	const [showZeroBalances, setShowZeroBalances] = React.useState(false)
	const { setSummary } = useActivitySummary()
	const { disconnect } = useDisconnect()
	const navigate = useNavigate()
	const [searchValue, setSearchValue] = React.useState('')
	const [searchFocused, setSearchFocused] = React.useState(false)
	const account = useAccount()
	const { sendTo, token: initialToken } = Route.useSearch()
	const { t } = useTranslation()
	const { announce } = useAnnounce()
	const [sendingToken, setSendingToken] = React.useState<string | null>(
		initialToken ?? null,
	)
	const [tokenAddressCopied, setTokenAddressCopied] = React.useState(false)

	// Assets state - starts from loader, can be refetched without page refresh
	const [assetsData, setAssetsData] = React.useState(initialAssets)
	// Activity state - starts from loader, can be refetched
	const [activity, setActivity] = React.useState(initialActivity)

	// Block timeline state
	const [currentBlock, setCurrentBlock] = React.useState<bigint | null>(null)
	const [_selectedBlockFilter, _setSelectedBlockFilter] = React.useState<
		bigint | undefined
	>(undefined)

	// Poll for current block number (500ms for smooth single-block transitions)
	React.useEffect(() => {
		let mounted = true

		const pollBlock = async () => {
			try {
				const result = await fetchCurrentBlockNumber()
				if (mounted && result.blockNumber) {
					setCurrentBlock(BigInt(result.blockNumber))
				}
			} catch {
				// Ignore errors
			}
		}

		pollBlock()
		const interval = setInterval(pollBlock, 2000)

		return () => {
			mounted = false
			clearInterval(interval)
		}
	}, [])

	// Sync with loader data when address changes
	React.useEffect(() => {
		setAssetsData(initialAssets)
		setActivity(initialActivity)
	}, [initialAssets, initialActivity])

	// Refetch balances without full page refresh
	const refetchAssetsBalances = React.useCallback(async () => {
		const newAssets = await fetchAssets({ data: { address } })
		if (!newAssets) return
		setAssetsData((prev) => {
			// Merge: update existing, add new
			const prevMap = new Map(prev.map((a) => [a.address.toLowerCase(), a]))
			for (const asset of newAssets) {
				prevMap.set(asset.address.toLowerCase(), asset)
			}
			return Array.from(prevMap.values())
		})
	}, [address])

	// Build token metadata map for activity parsing
	const tokenMetadataMap = React.useMemo(() => {
		const map = new Map<Address.Address, { decimals: number; symbol: string }>()
		for (const asset of assetsData) {
			if (asset.metadata?.decimals !== undefined && asset.metadata?.symbol) {
				map.set(asset.address, {
					decimals: asset.metadata.decimals,
					symbol: asset.metadata.symbol,
				})
			}
		}
		return map
	}, [assetsData])

	// Refetch activity without full page refresh
	const refetchActivity = React.useCallback(async () => {
		const newActivity = await fetchTransactions(
			address as Address.Address,
			tokenMetadataMap,
		)
		setActivity(newActivity)
	}, [address, tokenMetadataMap])

	// Optimistic balance adjustments: Map<tokenAddress, amountToSubtract>
	const [optimisticAdjustments, setOptimisticAdjustments] = React.useState<
		Map<string, bigint>
	>(new Map())

	const isOwnProfile = account.address?.toLowerCase() === address.toLowerCase()

	const applyOptimisticUpdate = React.useCallback(
		(tokenAddress: string, amount: bigint) => {
			setOptimisticAdjustments((prev) => {
				const next = new Map(prev)
				const current = next.get(tokenAddress.toLowerCase()) ?? 0n
				next.set(tokenAddress.toLowerCase(), current + amount)
				return next
			})
		},
		[],
	)

	const clearOptimisticUpdate = React.useCallback((tokenAddress: string) => {
		setOptimisticAdjustments((prev) => {
			const next = new Map(prev)
			next.delete(tokenAddress.toLowerCase())
			return next
		})
	}, [])

	const handleFaucetSuccess = React.useCallback(() => {
		// Refetch balances and activity without page refresh
		refetchAssetsBalances()
		// Delay activity refetch slightly to allow transaction to be indexed
		setTimeout(() => {
			refetchActivity()
		}, 1500)
	}, [refetchAssetsBalances, refetchActivity])

	const handleSendSuccess = React.useCallback(() => {
		// For sends, we rely on optimistic updates and delayed refresh
		setTimeout(() => {
			refetchAssetsBalances()
			refetchActivity()
		}, 2000)
	}, [refetchAssetsBalances, refetchActivity])

	React.useEffect(() => {
		if (activity.length > 0) {
			const typeCounts: Record<string, number> = {}
			for (const item of activity) {
				for (const e of item.events) {
					const type = eventTypeToActivityType(e.type)
					typeCounts[type] = (typeCounts[type] ?? 0) + 1
				}
			}
			const types = Object.keys(typeCounts) as Array<
				ReturnType<typeof eventTypeToActivityType>
			>
			setSummary({
				types,
				typeCounts: typeCounts as Record<
					ReturnType<typeof eventTypeToActivityType>,
					number
				>,
				count: activity.length,
				recentTimestamp: Date.now(),
			})
		} else {
			setSummary(null)
		}
		return () => setSummary(null)
	}, [activity, setSummary])

	// Ensure faucet tokens are always in the list
	const assetsWithFaucet = React.useMemo(() => {
		const existing = new Set(assetsData.map((a) => a.address.toLowerCase()))
		const missing = FAUCET_TOKEN_DEFAULTS.filter(
			(f) => !existing.has(f.address.toLowerCase()),
		)
		return [...assetsData, ...missing]
	}, [assetsData])

	const dedupedAssets = assetsWithFaucet.filter(
		(a, i, arr) => arr.findIndex((b) => b.address === a.address) === i,
	)

	// Apply optimistic adjustments to assets
	const adjustedAssets = React.useMemo(() => {
		return dedupedAssets.map((asset) => {
			const adjustment = optimisticAdjustments.get(asset.address.toLowerCase())
			if (!adjustment || !asset.balance) return asset

			const currentBalance = BigInt(asset.balance)
			const newBalance = currentBalance - adjustment
			const newBalanceStr = newBalance > 0n ? newBalance.toString() : '0'

			// Recalculate USD value
			const decimals = asset.metadata?.decimals ?? 18
			const priceUsd = asset.metadata?.priceUsd ?? 0
			const newValueUsd = (Number(newBalance) / 10 ** decimals) * priceUsd

			return {
				...asset,
				balance: newBalanceStr,
				valueUsd: newValueUsd > 0 ? newValueUsd : 0,
			}
		})
	}, [dedupedAssets, optimisticAdjustments])

	const totalValue = adjustedAssets.reduce(
		(sum, asset) => sum + (asset.valueUsd ?? 0),
		0,
	)
	const assetsWithBalance = adjustedAssets.filter(
		(a) =>
			(a.balance && a.balance !== '0') ||
			FAUCET_TOKEN_ADDRESSES.has(a.address.toLowerCase()),
	)
	const displayedAssets = showZeroBalances ? adjustedAssets : assetsWithBalance

	// Find selected asset for send form header
	const selectedSendAsset = sendingToken
		? displayedAssets.find(
				(a) => a.address.toLowerCase() === sendingToken.toLowerCase(),
			)
		: null

	const copyTokenAddress = React.useCallback(() => {
		if (selectedSendAsset) {
			copy(selectedSendAsset.address)
			setTokenAddressCopied(true)
			setTimeout(() => setTokenAddressCopied(false), 1500)
		}
	}, [selectedSendAsset, copy])

	// Get token addresses for access key spending limit queries
	const tokenAddresses = React.useMemo(
		() => dedupedAssets.map((a) => a.address),
		[dedupedAssets],
	)

	return (
		<AccessKeysProvider
			accountAddress={address}
			tokenAddresses={tokenAddresses}
		>
			<Layout.Header left={null} right={null} />

			<div className="pb-3">
				<div className="flex items-center justify-between mb-5">
					<Link to="/" className="flex items-center gap-2 press-down">
						<div
							className="size-[28px] rounded-[3px] flex items-center justify-center"
							style={{ backgroundColor: 'light-dark(#202020, #fcfcfc)' }}
						>
							<svg
								width="22"
								height="22"
								viewBox="0 0 269 269"
								fill="none"
								aria-hidden="true"
							>
								<title>Tempo logo</title>
								<path
									d="M123.273 190.794H93.445L121.09 105.318H85.7334L93.445 80.2642H191.95L184.238 105.318H150.773L123.273 190.794Z"
									style={{ fill: 'light-dark(#f5f5f5, #0a0a0a)' }}
								/>
							</svg>
						</div>
					</Link>
					<div className="relative">
						<form
							onSubmit={(e) => {
								e.preventDefault()
								const trimmed = searchValue.trim()
								if (trimmed.match(/^0x[a-fA-F0-9]{40}$/)) {
									navigate({ to: '/$address', params: { address: trimmed } })
									setSearchValue('')
									setSearchFocused(false)
								}
							}}
							className={cx(
								'flex items-center gap-1.5 pl-2.5 pr-3 h-[36px] rounded-full bg-base-alt transition-colors',
								searchFocused ? 'ring-1 ring-accent/50' : '',
							)}
						>
							<SearchIcon className="size-[14px] text-secondary" />
							<input
								type="text"
								value={searchValue}
								onChange={(e) => setSearchValue(e.target.value)}
								onFocus={() => setSearchFocused(true)}
								onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
								placeholder={t('common.search')}
								className="bg-transparent outline-none text-[13px] text-primary placeholder:text-secondary w-[80px] sm:w-[100px] focus:w-[140px] sm:focus:w-[180px] transition-all"
							/>
						</form>
						{searchFocused &&
							searchValue.trim().match(/^0x[a-fA-F0-9]{40}$/) && (
								<div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-card-border rounded-full shadow-xl overflow-hidden z-50">
									<button
										type="button"
										onMouseDown={(e) => {
											e.preventDefault()
											navigate({
												to: '/$address',
												params: { address: searchValue.trim() },
											})
											setSearchValue('')
											setSearchFocused(false)
										}}
										className="w-full h-[32px] px-3 text-left hover:bg-base-alt transition-colors cursor-pointer flex items-center justify-between"
									>
										<div className="flex flex-col min-w-0">
											<span className="text-[11px] text-primary font-mono truncate">
												{searchValue.trim().slice(0, 6)}...
												{searchValue.trim().slice(-4)}
											</span>
										</div>
										<ChevronDownIcon className="size-3 text-tertiary -rotate-90 shrink-0" />
									</button>
								</div>
							)}
					</div>
					{isOwnProfile ? (
						<button
							type="button"
							onClick={() => {
								disconnect()
								navigate({ to: '/' })
							}}
							className="flex items-center justify-center size-[36px] rounded-full bg-base-alt hover:bg-base-alt/80 active:bg-base-alt/60 transition-colors cursor-pointer focus-ring"
							aria-label={t('common.logOut')}
						>
							<LogOutIcon className="size-[14px] text-secondary" />
						</button>
					) : (
						<button
							type="button"
							onClick={() => navigate({ to: '/' })}
							className="flex items-center justify-center size-[36px] rounded-full bg-accent hover:bg-accent/90 active:bg-accent/80 transition-colors cursor-pointer focus-ring"
							aria-label={t('common.signIn')}
						>
							<LogInIcon className="size-[14px] text-white" />
						</button>
					)}
				</div>
				<div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 mb-5">
					<div className="flex-1 min-w-0 flex flex-col gap-2 order-2 sm:order-1">
						<div className="flex items-baseline gap-2">
							<LottoNumber
								value={formatUsd(totalValue)}
								duration={1200}
								className="text-[36px] sm:text-[40px] md:text-[56px] font-sans font-semibold text-primary -tracking-[0.02em] tabular-nums"
							/>
						</div>
						<div className="flex items-center gap-2 max-w-full">
							<code className="text-[11px] sm:text-[13px] font-mono text-secondary leading-tight min-w-0">
								{address.slice(0, 21)}
								<br />
								{address.slice(21)}
							</code>
							<div className="flex items-center gap-1.5">
								<button
									type="button"
									onClick={() => {
										copy(address)
										announce(t('a11y.addressCopied'))
									}}
									className="flex items-center justify-center size-[32px] sm:size-[28px] rounded-full sm:rounded-md bg-base-alt hover:bg-base-alt/70 cursor-pointer press-down transition-colors shrink-0 focus-ring"
									aria-label={t('common.copyAddress')}
								>
									{notifying ? (
										<CheckIcon className="size-[14px] text-positive" />
									) : (
										<CopyIcon className="size-[14px] text-tertiary" />
									)}
								</button>
								<a
									href={`https://explore.mainnet.tempo.xyz/address/${address}`}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center justify-center size-[32px] sm:size-[28px] rounded-full sm:rounded-md bg-base-alt hover:bg-base-alt/70 press-down transition-colors shrink-0 focus-ring"
									aria-label={t('common.viewOnExplorer')}
								>
									<ExternalLinkIcon className="size-[14px] text-tertiary" />
								</a>
							</div>
						</div>
					</div>
					<div className="order-1 sm:order-2 self-center sm:self-start w-full sm:w-auto px-8 sm:px-0">
						<QRCode
							value={address}
							size="full"
							className="sm:hidden shrink-0 max-w-[200px] mx-auto"
						/>
						<QRCode
							value={address}
							size={72}
							className="hidden sm:block md:hidden shrink-0"
						/>
						<QRCode
							value={address}
							size={100}
							className="hidden md:block shrink-0"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-2.5">
					<Section title="Add Funds">
						<AddFunds address={address} />
					</Section>

					<Section
						title={t('portfolio.assets')}
						subtitle={`${assetsWithBalance.length} ${t('portfolio.assetCount', { count: assetsWithBalance.length })}`}
						defaultOpen
						backButton={
							selectedSendAsset
								? {
										label:
											selectedSendAsset.metadata?.symbol ||
											shortenAddress(selectedSendAsset.address, 3),
										onClick: () => setSendingToken(null),
										extra: (
											<>
												<span className="w-px h-4 bg-card-border" />
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation()
														copyTokenAddress()
													}}
													className="flex items-center gap-1.5 text-[12px] text-tertiary hover:text-primary font-mono transition-colors cursor-pointer"
												>
													<span>
														{shortenAddress(selectedSendAsset.address, 4)}
													</span>
													{tokenAddressCopied ? (
														<CheckIcon className="w-[10px] h-[10px] text-positive shrink-0" />
													) : (
														<CopyIcon className="w-[10px] h-[10px] shrink-0" />
													)}
												</button>
											</>
										),
									}
								: undefined
						}
						headerRight={
							selectedSendAsset ? undefined : (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation()
										setShowZeroBalances(!showZeroBalances)
									}}
									className="flex items-center justify-center size-[24px] rounded-md bg-base-alt hover:bg-base-alt/70 transition-colors cursor-pointer focus-ring"
									aria-label={
										showZeroBalances
											? t('portfolio.hideZeroBalances')
											: t('portfolio.showZeroBalances')
									}
									aria-pressed={showZeroBalances}
								>
									{showZeroBalances ? (
										<EyeOffIcon className="size-[14px] text-tertiary" />
									) : (
										<EyeIcon className="size-[14px] text-tertiary" />
									)}
								</button>
							)
						}
					>
						<HoldingsTable
							assets={displayedAssets}
							address={address}
							onFaucetSuccess={handleFaucetSuccess}
							onSendSuccess={handleSendSuccess}
							onOptimisticSend={applyOptimisticUpdate}
							onOptimisticClear={clearOptimisticUpdate}
							isOwnProfile={isOwnProfile}
							connectedAddress={account.address}
							initialSendTo={sendTo}
							sendingToken={sendingToken}
							onSendingTokenChange={setSendingToken}
							announce={announce}
						/>
					</Section>

					<ActivitySection
						activity={activity}
						address={address}
						currentBlock={currentBlock}
						tokenMetadataMap={tokenMetadataMap}
					/>

					<AccessKeysSection assets={assetsData} accountAddress={address} />

					<SettingsSection assets={assetsData} />
				</div>
			</div>
		</AccessKeysProvider>
	)
}

function QRCode({
	value,
	size = 100,
	className,
}: {
	value: string
	size?: number | 'full'
	className?: string
}) {
	const { data } = encode(value)
	const gridSize = data.length
	const cellSize = 100 / gridSize

	const cells: Array<{ x: number; y: number }> = []
	for (let y = 0; y < data.length; y++) {
		for (let x = 0; x < data[y].length; x++) {
			if (data[y][x]) cells.push({ x, y })
		}
	}

	const { copy, notifying } = useCopy({ timeout: 1500 })
	const [mousePos, setMousePos] = React.useState<{
		x: number
		y: number
	} | null>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)

	const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
		const svg = svgRef.current
		if (!svg) return
		const rect = svg.getBoundingClientRect()
		const x = ((e.clientX - rect.left) / rect.width) * 100
		const y = ((e.clientY - rect.top) / rect.height) * 100
		setMousePos({ x, y })
	}

	const isFull = size === 'full'

	return (
		<svg
			ref={svgRef}
			role="img"
			aria-label="QR Code - Click to copy address"
			className={cx(
				'rounded-lg bg-surface p-1.5 cursor-pointer outline-none border border-base-border hover:border-accent/50 transition-colors',
				isFull && 'w-full aspect-square',
				className,
			)}
			width={isFull ? undefined : size}
			height={isFull ? undefined : size}
			viewBox="0 0 100 100"
			onClick={() => copy(value)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') copy(value)
			}}
			onMouseMove={handleMouseMove}
			onMouseLeave={() => setMousePos(null)}
		>
			<title>QR Code</title>
			{cells.map(({ x, y }) => {
				let opacity = 0.6
				if (mousePos && !notifying) {
					const cellCenterX = x * cellSize + cellSize / 2
					const cellCenterY = y * cellSize + cellSize / 2
					const distance = Math.sqrt(
						(cellCenterX - mousePos.x) ** 2 + (cellCenterY - mousePos.y) ** 2,
					)
					const maxBrightRadius = 40
					const brightness = 1 - Math.min(1, distance / maxBrightRadius)
					opacity = 0.5 + brightness * 0.5
				}
				return (
					<rect
						key={`${x}-${y}`}
						x={x * cellSize}
						y={y * cellSize}
						width={cellSize}
						height={cellSize}
						fill={notifying ? '#22c55e' : 'currentColor'}
						className="text-primary"
						style={{
							opacity,
							transition: 'fill 0.2s ease-out, opacity 0.15s ease-out',
							filter:
								mousePos && !notifying
									? `blur(${Math.max(0, (1 - opacity) * 0.3)}px)`
									: undefined,
						}}
					/>
				)
			})}
		</svg>
	)
}

function SettingsSection({ assets }: { assets: AssetData[] }) {
	const { t } = useTranslation()
	const assetsWithBalance = assets.filter((a) => a.balance && a.balance !== '0')
	const [currentFeeToken, setCurrentFeeToken] = React.useState<string>(
		assetsWithBalance[0]?.address ?? '',
	)
	const [currentLanguage, setCurrentLanguage] = React.useState(() => {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('tempo-language')
			if (saved) {
				i18n.changeLanguage(saved)
				document.documentElement.dir = isRtl(saved) ? 'rtl' : 'ltr'
				return saved
			}
		}
		return 'en'
	})
	const [currentView, setCurrentView] = React.useState<SettingsView>('main')
	const [triggerBack, setTriggerBack] = React.useState(false)

	const handleLanguageChange = React.useCallback((lang: string) => {
		setCurrentLanguage(lang)
		i18n.changeLanguage(lang)
		if (typeof window !== 'undefined') {
			localStorage.setItem('tempo-language', lang)
			document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr'
		}
	}, [])

	const handleBack = React.useCallback(() => {
		setTriggerBack(true)
		setTimeout(() => setTriggerBack(false), 50)
	}, [])

	const submenuTitle =
		currentView !== 'main' ? t(SETTINGS_VIEW_TITLES[currentView]) : undefined

	return (
		<Section
			title={t('settings.title')}
			backButton={
				submenuTitle ? { label: submenuTitle, onClick: handleBack } : undefined
			}
		>
			<Settings
				assets={assets}
				currentFeeToken={currentFeeToken}
				onFeeTokenChange={setCurrentFeeToken}
				currentLanguage={currentLanguage}
				onLanguageChange={handleLanguageChange}
				onViewChange={setCurrentView}
				externalNavigateBack={triggerBack}
			/>
		</Section>
	)
}

function formatAmount(value: string, decimals: number): string {
	const formatted = formatUnits(BigInt(value), decimals)
	const num = Number(formatted)
	if (num < 0.01 && num > 0) return '<0.01'
	return num.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
}

function formatUsd(value: number): string {
	if (value === 0) return '$0.00'
	return `$${value.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

function formatUsdCompact(value: number): string {
	if (value === 0) return '$0'
	const absValue = Math.abs(value)
	const sign = value < 0 ? '-' : ''
	if (absValue >= 1_000_000_000) {
		return `${sign}$${(absValue / 1_000_000_000).toFixed(1)}b`
	}
	if (absValue >= 1_000_000) {
		return `${sign}$${(absValue / 1_000_000).toFixed(1)}m`
	}
	if (absValue >= 1_000) {
		return `${sign}$${(absValue / 1_000).toFixed(1)}k`
	}
	return `${sign}$${absValue.toFixed(2)}`
}

function ActivityHeatmap({
	activity,
	currentBlock,
}: {
	activity: ActivityItem[]
	currentBlock: bigint | null
}) {
	// Use block numbers for bucketing since timestamps may not be available
	// Tempo produces ~2 blocks/second, so 7200 blocks ≈ 1 hour
	// Show last ~24 hours of activity spread across the grid

	// Desktop: 48 cols × 7 rows = 336 slots
	// Mobile: 24 cols × 5 rows = 120 slots (bigger squares)
	const [isMobile, setIsMobile] = React.useState(false)

	React.useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 640)
		checkMobile()
		window.addEventListener('resize', checkMobile)
		return () => window.removeEventListener('resize', checkMobile)
	}, [])

	const rows = isMobile ? 5 : 7
	const cols = isMobile ? 24 : 48
	const totalSlots = rows * cols

	// Blocks per slot - aim for ~24 hours coverage
	// ~2 blocks/sec × 60 sec × 60 min × 24 hours = 172,800 blocks/day
	const blocksPerDay = 172800n
	const blocksPerSlot = blocksPerDay / BigInt(totalSlots)

	const activityBySlot = React.useMemo(() => {
		const counts = new Map<number, number>()
		if (!currentBlock) return counts

		const oldestBlock = currentBlock - blocksPerDay

		for (let i = 0; i < activity.length; i++) {
			const item = activity[i]
			if (!item.blockNumber) continue
			if (item.blockNumber < oldestBlock) continue

			// Calculate which slot this block falls into
			const blocksFromOldest = item.blockNumber - oldestBlock
			const bucket = Number(blocksFromOldest / blocksPerSlot)
			if (bucket >= 0 && bucket < totalSlots) {
				counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
			}
		}
		return counts
	}, [activity, currentBlock, totalSlots, blocksPerSlot])

	const grid = React.useMemo(() => {
		const data: { level: number; count: number; slotIndex: number }[][] = []

		const maxCount = Math.max(1, ...activityBySlot.values())

		for (let c = 0; c < cols; c++) {
			const column: { level: number; count: number; slotIndex: number }[] = []
			for (let r = 0; r < rows; r++) {
				const bucket = c * rows + r
				if (bucket >= totalSlots) {
					column.push({ level: 0, count: 0, slotIndex: bucket })
					continue
				}
				const count = activityBySlot.get(bucket) ?? 0
				const level =
					count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4))
				column.push({ level, count, slotIndex: bucket })
			}
			data.push(column)
		}
		return data
	}, [activityBySlot, cols, rows, totalSlots])

	const getColor = (level: number) => {
		const colors = [
			'bg-base-alt/40',
			'bg-green-300/70 dark:bg-green-900',
			'bg-green-400 dark:bg-green-700',
			'bg-green-500 dark:bg-green-500',
			'bg-green-600 dark:bg-green-400',
		]
		return colors[level] ?? colors[0]
	}

	const formatSlotTime = (slotIndex: number) => {
		// Estimate time based on slot position (older = lower index)
		const hoursAgo = ((totalSlots - 1 - slotIndex) / totalSlots) * 24
		if (hoursAgo < 1) return 'now'
		if (hoursAgo < 2) return '~1h ago'
		return `~${Math.round(hoursAgo)}h ago`
	}

	const [hoveredCell, setHoveredCell] = React.useState<{
		count: number
		slotIndex: number
		x: number
		y: number
	} | null>(null)

	return (
		<div className="relative">
			<div
				className={cx('flex w-full py-2', isMobile ? 'gap-[4px]' : 'gap-[3px]')}
			>
				{grid.map((column, hi) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: grid is static and doesn't reorder
					<div
						key={`h-${hi}`}
						className={cx(
							'flex flex-col flex-1',
							isMobile ? 'gap-[4px]' : 'gap-[3px]',
						)}
					>
						{column.map((cell, di) => (
							// biome-ignore lint/a11y/noStaticElementInteractions: hover tooltip only
							<div
								key={`${hi}-${di}`}
								className={cx(
									'w-full aspect-square cursor-default',
									isMobile ? 'rounded-[3px]' : 'rounded-[2px]',
									getColor(cell.level),
								)}
								onMouseEnter={(e) => {
									const rect = e.currentTarget.getBoundingClientRect()
									setHoveredCell({
										count: cell.count,
										slotIndex: cell.slotIndex,
										x: rect.left + rect.width / 2,
										y: rect.top,
									})
								}}
								onMouseLeave={() => setHoveredCell(null)}
							/>
						))}
					</div>
				))}
			</div>
			{hoveredCell &&
				createPortal(
					<div
						className="fixed z-[100] px-2 py-1 text-[11px] text-white bg-gray-900 rounded-md shadow-lg whitespace-nowrap pointer-events-none border border-gray-700"
						style={{
							left: hoveredCell.x,
							top: hoveredCell.y - 6,
							transform: 'translate(-50%, -100%)',
						}}
					>
						<span className="font-medium">{hoveredCell.count}</span> tx
						{hoveredCell.count !== 1 ? 's' : ''} ·{' '}
						<span className="text-gray-300">
							{formatSlotTime(hoveredCell.slotIndex)}
						</span>
					</div>,
					document.body,
				)}
		</div>
	)
}

function BlockTimeline({
	activity,
	currentBlock,
	selectedBlock,
	onSelectBlock,
}: {
	activity: ActivityItem[]
	currentBlock: bigint | null
	selectedBlock: bigint | undefined
	onSelectBlock: (block: bigint | undefined) => void
}) {
	const { t } = useTranslation()
	const scrollRef = React.useRef<HTMLDivElement>(null)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const [blockTxCounts, setBlockTxCounts] = React.useState<Map<string, number>>(
		new Map(),
	)
	const [displayBlock, setDisplayBlock] = React.useState<bigint | null>(null)
	const [isPaused, setIsPaused] = React.useState(false)
	const [focusedBlockIndex, setFocusedBlockIndex] = React.useState<
		number | null
	>(null)
	const [hoveredBlock, setHoveredBlock] = React.useState<{
		blockNumber: bigint
		txCount: number
		x: number
		y: number
	} | null>(null)
	const [dragState, setDragState] = React.useState<{
		startBlock: bigint
		endBlock: bigint
	} | null>(null)
	const lastFetchedBlockRef = React.useRef<bigint | null>(null)
	const pauseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
		null,
	)
	const prefetchedBlocksRef = React.useRef<Set<string>>(new Set())

	const userBlockNumbers = React.useMemo(() => {
		const blocks = new Set<bigint>()
		for (const item of activity) {
			if (item.blockNumber !== undefined) {
				blocks.add(item.blockNumber)
			}
		}
		return blocks
	}, [activity])

	const blocksBeforeCurrent = 20
	const blocksAfterCurrent = 20

	// Initialize displayBlock
	React.useEffect(() => {
		if (currentBlock && displayBlock === null) {
			setDisplayBlock(currentBlock)
		}
	}, [currentBlock, displayBlock])

	// Smoothly increment displayBlock toward currentBlock one at a time
	// Pause animation when a block is selected
	React.useEffect(() => {
		if (
			!currentBlock ||
			!displayBlock ||
			isPaused ||
			selectedBlock !== undefined
		)
			return
		if (displayBlock >= currentBlock) return

		// Calculate delay based on how far behind we are
		// Faster catch-up if many blocks behind, slower when close
		const blocksBehind = Number(currentBlock - displayBlock)
		const delay = blocksBehind > 5 ? 50 : blocksBehind > 2 ? 100 : 300

		const timer = setTimeout(() => {
			setDisplayBlock((prev) => (prev ? prev + 1n : currentBlock))
		}, delay)

		return () => clearTimeout(timer)
	}, [currentBlock, displayBlock, isPaused, selectedBlock])

	// Fetch block data when currentBlock changes
	React.useEffect(() => {
		if (!currentBlock) return

		const fetchBlocks = async () => {
			const lastFetched = lastFetchedBlockRef.current
			if (lastFetched && currentBlock <= lastFetched) return

			const blocksToFetch = lastFetched
				? Math.min(Number(currentBlock - lastFetched), 10)
				: blocksBeforeCurrent + 1

			try {
				const result = await fetchBlockData({
					data: {
						fromBlock: `0x${currentBlock.toString(16)}`,
						count: blocksToFetch,
					},
				})
				if (result.blocks.length > 0) {
					setBlockTxCounts((prev) => {
						const next = new Map(prev)
						for (const b of result.blocks) {
							next.set(BigInt(b.blockNumber).toString(), b.txCount)
						}
						return next
					})
					lastFetchedBlockRef.current = currentBlock
				}
			} catch {
				// Ignore
			}
		}

		fetchBlocks()
	}, [currentBlock])

	// Pre-fetch adjacent blocks on hover
	const prefetchAdjacentBlocks = React.useCallback(
		async (blockNumber: bigint) => {
			const blocksToCheck = [
				blockNumber - 2n,
				blockNumber - 1n,
				blockNumber + 1n,
				blockNumber + 2n,
			]
			const missingBlocks = blocksToCheck.filter(
				(b) =>
					b > 0n &&
					!blockTxCounts.has(b.toString()) &&
					!prefetchedBlocksRef.current.has(b.toString()),
			)

			if (missingBlocks.length === 0) return

			for (const b of missingBlocks) {
				prefetchedBlocksRef.current.add(b.toString())
			}

			try {
				const maxBlock = missingBlocks.reduce((a, b) => (a > b ? a : b))
				const result = await fetchBlockData({
					data: {
						fromBlock: `0x${maxBlock.toString(16)}`,
						count: 5,
					},
				})
				if (result.blocks.length > 0) {
					setBlockTxCounts((prev) => {
						const next = new Map(prev)
						for (const b of result.blocks) {
							next.set(BigInt(b.blockNumber).toString(), b.txCount)
						}
						return next
					})
				}
			} catch {
				// Ignore prefetch errors
			}
		},
		[blockTxCounts],
	)

	const handleScroll = React.useCallback(() => {
		setIsPaused(true)
		if (pauseTimeoutRef.current) {
			clearTimeout(pauseTimeoutRef.current)
		}
		pauseTimeoutRef.current = setTimeout(() => {
			setIsPaused(false)
		}, 3000)
	}, [])

	React.useEffect(() => {
		return () => {
			if (pauseTimeoutRef.current) {
				clearTimeout(pauseTimeoutRef.current)
			}
		}
	}, [])

	const blocks = React.useMemo(() => {
		const blockToShow = displayBlock ?? currentBlock
		if (!blockToShow) return []
		const result: {
			blockNumber: bigint
			hasUserActivity: boolean
			txCount: number
			isPlaceholder: boolean
		}[] = []

		// Blocks before current
		for (let i = blocksBeforeCurrent; i >= 1; i--) {
			const blockNum = blockToShow - BigInt(i)
			if (blockNum > 0n) {
				result.push({
					blockNumber: blockNum,
					hasUserActivity: userBlockNumbers.has(blockNum),
					txCount: blockTxCounts.get(blockNum.toString()) ?? 0,
					isPlaceholder: false,
				})
			}
		}

		// Current block
		result.push({
			blockNumber: blockToShow,
			hasUserActivity: userBlockNumbers.has(blockToShow),
			txCount: blockTxCounts.get(blockToShow.toString()) ?? 0,
			isPlaceholder: false,
		})

		// Placeholder blocks after current
		for (let i = 1; i <= blocksAfterCurrent; i++) {
			result.push({
				blockNumber: blockToShow + BigInt(i),
				hasUserActivity: false,
				txCount: 0,
				isPlaceholder: true,
			})
		}

		return result
	}, [displayBlock, currentBlock, userBlockNumbers, blockTxCounts])

	const handleBlockClick = (blockNumber: bigint, isPlaceholder: boolean) => {
		if (isPlaceholder) return
		if (selectedBlock === blockNumber) {
			onSelectBlock(undefined)
		} else {
			onSelectBlock(blockNumber)
		}
	}

	// Keyboard navigation
	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			if (blocks.length === 0) return

			const currentIndex =
				focusedBlockIndex ??
				blocks.findIndex((b) => b.blockNumber === selectedBlock) ??
				blocks.findIndex(
					(b) =>
						!b.isPlaceholder &&
						b.blockNumber === (displayBlock ?? currentBlock),
				)

			let newIndex =
				currentIndex === -1 ? Math.floor(blocks.length / 2) : currentIndex

			switch (e.key) {
				case 'ArrowLeft':
					e.preventDefault()
					newIndex = Math.max(0, newIndex - 1)
					while (newIndex > 0 && blocks[newIndex]?.isPlaceholder) {
						newIndex--
					}
					break
				case 'ArrowRight':
					e.preventDefault()
					newIndex = Math.min(blocks.length - 1, newIndex + 1)
					while (
						newIndex < blocks.length - 1 &&
						blocks[newIndex]?.isPlaceholder
					) {
						newIndex++
					}
					if (blocks[newIndex]?.isPlaceholder) {
						newIndex = currentIndex
					}
					break
				case 'Enter':
				case ' ':
					e.preventDefault()
					if (focusedBlockIndex !== null && blocks[focusedBlockIndex]) {
						const block = blocks[focusedBlockIndex]
						if (!block.isPlaceholder) {
							handleBlockClick(block.blockNumber, block.isPlaceholder)
						}
					}
					return
				case 'Escape':
					e.preventDefault()
					onSelectBlock(undefined)
					setFocusedBlockIndex(null)
					return
				case 'Home':
					e.preventDefault()
					newIndex = 0
					break
				case 'End':
					e.preventDefault()
					newIndex = blocks.findLastIndex((b) => !b.isPlaceholder)
					break
				default:
					return
			}

			if (
				newIndex !== currentIndex &&
				blocks[newIndex] &&
				!blocks[newIndex].isPlaceholder
			) {
				setFocusedBlockIndex(newIndex)
				// Pre-fetch when navigating
				prefetchAdjacentBlocks(blocks[newIndex].blockNumber)
			}
		},
		[
			blocks,
			focusedBlockIndex,
			selectedBlock,
			displayBlock,
			currentBlock,
			onSelectBlock,
			prefetchAdjacentBlocks,
			handleBlockClick,
		],
	)

	// Drag selection handlers
	const handleMouseDown = (blockNumber: bigint, isPlaceholder: boolean) => {
		if (isPlaceholder) return
		setDragState({ startBlock: blockNumber, endBlock: blockNumber })
	}

	const handleMouseEnter = (
		blockNumber: bigint,
		isPlaceholder: boolean,
		e: React.MouseEvent,
	) => {
		if (!isPlaceholder) {
			const rect = e.currentTarget.getBoundingClientRect()
			setHoveredBlock({
				blockNumber,
				txCount: blockTxCounts.get(blockNumber.toString()) ?? 0,
				x: rect.left + rect.width / 2,
				y: rect.top,
			})
			// Pre-fetch adjacent blocks
			prefetchAdjacentBlocks(blockNumber)
		}

		if (dragState && !isPlaceholder) {
			setDragState((prev) => (prev ? { ...prev, endBlock: blockNumber } : null))
		}
	}

	const handleMouseUp = () => {
		if (dragState) {
			const start =
				dragState.startBlock < dragState.endBlock
					? dragState.startBlock
					: dragState.endBlock
			const end =
				dragState.startBlock < dragState.endBlock
					? dragState.endBlock
					: dragState.startBlock

			if (start === end) {
				// Single block click
				handleBlockClick(start, false)
			} else {
				// Range selection - select the start block for now
				// Could extend to support range in the future
				onSelectBlock(start)
			}
			setDragState(null)
		}
	}

	const isInDragRange = (blockNumber: bigint) => {
		if (!dragState) return false
		const start =
			dragState.startBlock < dragState.endBlock
				? dragState.startBlock
				: dragState.endBlock
		const end =
			dragState.startBlock < dragState.endBlock
				? dragState.endBlock
				: dragState.startBlock
		return blockNumber >= start && blockNumber <= end
	}

	const getBlockStyle = (
		txCount: number,
		_isSelected: boolean,
		_isCurrent: boolean,
		hasUserActivity: boolean,
		isPlaceholder: boolean,
	): string => {
		if (isPlaceholder) return 'bg-base-alt/20'
		// Current block no longer gets special fill - just a ring (applied separately)
		if (hasUserActivity) return 'bg-green-500'

		// Simple discrete scale: 0=dim, 1=grey, 2=slight color, 3+=bright
		if (txCount === 0) return 'bg-base-alt/40'
		if (txCount === 1) return 'bg-base-alt/70'
		if (txCount === 2) return 'bg-emerald-800/70'
		return 'bg-emerald-500'
	}

	if (!currentBlock) {
		return (
			<div className="flex flex-col gap-1.5 mt-2 mb-3">
				<div className="flex items-center justify-center gap-[2px] w-full p-1">
					{Array.from({ length: 30 }).map((_, i) => (
						<div
							key={i}
							className="shrink-0 size-[8px] rounded-[1px] bg-base-alt/20 animate-pulse"
						/>
					))}
				</div>
				<div className="flex items-center justify-center">
					<div className="flex items-center gap-1 h-5 px-2 rounded-full bg-white/5 border border-white/10">
						<span className="text-[11px] text-tertiary">
							{t('common.block')}
						</span>
						<span className="text-[11px] text-tertiary font-mono">...</span>
					</div>
				</div>
			</div>
		)
	}

	const shownBlock = displayBlock ?? currentBlock

	return (
		<div
			ref={containerRef}
			className="flex flex-col gap-1.5 mt-2 mb-3"
			onMouseUp={handleMouseUp}
			onMouseLeave={() => {
				setHoveredBlock(null)
				if (dragState) {
					handleMouseUp()
				}
			}}
		>
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				onKeyDown={handleKeyDown}
				tabIndex={0}
				role="listbox"
				aria-label={t('portfolio.blockTimeline') || 'Block timeline'}
				aria-activedescendant={
					focusedBlockIndex !== null
						? `block-${blocks[focusedBlockIndex]?.blockNumber.toString()}`
						: undefined
				}
				className="flex items-center justify-center gap-[2px] w-full overflow-x-auto no-scrollbar py-1.5 -mx-2 px-2 focus-ring rounded-sm"
			>
				{blocks.map((block, index) => {
					const isSelected = selectedBlock === block.blockNumber
					const isCurrent =
						block.blockNumber === shownBlock && !block.isPlaceholder
					const isFocused = focusedBlockIndex === index
					const inDragRange = isInDragRange(block.blockNumber)
					return (
						<button
							key={block.blockNumber.toString()}
							id={`block-${block.blockNumber.toString()}`}
							type="button"
							role="option"
							aria-selected={isSelected}
							onMouseDown={() =>
								handleMouseDown(block.blockNumber, block.isPlaceholder)
							}
							onMouseEnter={(e) =>
								handleMouseEnter(block.blockNumber, block.isPlaceholder, e)
							}
							onMouseLeave={() => setHoveredBlock(null)}
							disabled={block.isPlaceholder}
							className={cx(
								'shrink-0 size-3 rounded-sm transition-all duration-300 ease-out',
								inDragRange && !block.isPlaceholder
									? 'block-range-selected'
									: getBlockStyle(
											block.txCount,
											isSelected,
											isCurrent,
											block.hasUserActivity,
											block.isPlaceholder,
										),
								// Current block gets a prominent white ring with smooth animation
								isCurrent &&
									!isSelected &&
									'ring-2 ring-white/90 ring-offset-1 ring-offset-black scale-110',
								isSelected &&
									'ring-2 ring-accent ring-offset-1 ring-offset-black scale-110',
								isFocused &&
									!isSelected &&
									!isCurrent &&
									'ring-2 ring-accent/50',
								block.hasUserActivity &&
									!isSelected &&
									!isCurrent &&
									!isFocused &&
									'ring-1 ring-green-500/60',
								block.isPlaceholder
									? 'cursor-default opacity-20'
									: 'hover:opacity-90 cursor-pointer',
							)}
						/>
					)
				})}
			</div>

			{/* Hover tooltip */}
			{hoveredBlock &&
				createPortal(
					<div
						className="fixed z-[100] px-2 py-1 text-[11px] text-white bg-gray-900 rounded-md shadow-lg whitespace-nowrap pointer-events-none border border-gray-700"
						style={{
							left: hoveredBlock.x,
							top: hoveredBlock.y - 6,
							transform: 'translate(-50%, -100%)',
						}}
					>
						<span className="font-medium font-mono">
							#{hoveredBlock.blockNumber.toString()}
						</span>
						{' | '}
						<span className="text-emerald-400">
							{hoveredBlock.txCount} event
							{hoveredBlock.txCount !== 1 ? 's' : ''}
						</span>
						{currentBlock && (
							<>
								{' | '}
								<span className="text-gray-400">
									{(() => {
										const blockDiff = Number(
											currentBlock - hoveredBlock.blockNumber,
										)
										const msAgo = blockDiff * 100 // ~100ms per block on Tempo
										if (blockDiff <= 0) return 'now'
										if (msAgo < 1000) return `${msAgo}ms ago`
										if (msAgo < 60000)
											return `${(msAgo / 1000).toFixed(1)}s ago`
										if (msAgo < 3600000)
											return `${Math.floor(msAgo / 60000)}m ago`
										return `${Math.floor(msAgo / 3600000)}h ago`
									})()}
								</span>
							</>
						)}
					</div>,
					document.body,
				)}

			<div className="flex items-center justify-center">
				<div
					className={cx(
						'flex items-center gap-1.5 h-5 pl-0.5 pr-2 rounded-full border transition-colors',
						selectedBlock !== undefined
							? 'bg-accent/20 border-accent/30'
							: 'bg-surface border-card-border',
					)}
				>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							if (pauseTimeoutRef.current) {
								clearTimeout(pauseTimeoutRef.current)
								pauseTimeoutRef.current = null
							}
							if (isPaused || selectedBlock !== undefined) {
								setIsPaused(false)
								onSelectBlock(undefined)
								if (currentBlock) {
									setDisplayBlock(currentBlock)
								}
							} else {
								setIsPaused(true)
							}
						}}
						className={cx(
							'flex items-center justify-center size-4 rounded-full transition-colors cursor-pointer',
							isPaused || selectedBlock !== undefined
								? 'bg-accent/30 hover:bg-accent/40'
								: 'bg-tertiary/20 hover:bg-tertiary/30',
						)}
						aria-label={
							isPaused || selectedBlock !== undefined
								? t('portfolio.resumeLiveUpdates')
								: t('portfolio.pauseLiveUpdates')
						}
					>
						{isPaused || selectedBlock !== undefined ? (
							<PlayIcon className="size-2 text-accent fill-accent" />
						) : (
							<svg className="size-2" viewBox="0 0 24 24" fill="currentColor">
								<rect x="6" y="4" width="4" height="16" rx="1" />
								<rect x="14" y="4" width="4" height="16" rx="1" />
							</svg>
						)}
					</button>
					<span className="text-[11px] text-tertiary">{t('common.block')}</span>
					<span className="text-[11px] text-primary font-mono tabular-nums">
						{selectedBlock !== undefined
							? selectedBlock.toString()
							: (shownBlock?.toString() ?? '...')}
					</span>
				</div>
			</div>
		</div>
	)
}

function HoldingsTable({
	assets,
	address,
	onFaucetSuccess,
	onSendSuccess,
	onOptimisticSend,
	onOptimisticClear,
	isOwnProfile,
	connectedAddress,
	initialSendTo,
	sendingToken,
	onSendingTokenChange,
	announce,
}: {
	assets: AssetData[]
	address: string
	onFaucetSuccess?: () => void
	onSendSuccess?: () => void
	onOptimisticSend?: (tokenAddress: string, amount: bigint) => void
	onOptimisticClear?: (tokenAddress: string) => void
	isOwnProfile: boolean
	connectedAddress?: string
	initialSendTo?: string
	sendingToken: string | null
	onSendingTokenChange: (token: string | null) => void
	announce: (message: string) => void
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [toastMessage, setToastMessage] = React.useState<string | null>(null)

	// Use global access keys from context
	const { keys: signableAccessKeys } = useSignableAccessKeys()

	console.log(
		'[PortfolioSection] signableAccessKeys:',
		signableAccessKeys.length,
		signableAccessKeys.map((k) => k.keyId.slice(0, 10)),
	)

	React.useEffect(() => {
		if (toastMessage) {
			const timeout = setTimeout(() => setToastMessage(null), 3000)
			return () => clearTimeout(timeout)
		}
	}, [toastMessage])

	if (assets.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-6 gap-2">
				<div className="size-10 rounded-full bg-base-alt flex items-center justify-center">
					<svg
						className="size-5 text-tertiary"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<title>No assets icon</title>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 6v12M6 12h12" strokeLinecap="round" />
					</svg>
				</div>
				<p className="text-[13px] text-secondary">
					{t('portfolio.noAssetsFound')}
				</p>
			</div>
		)
	}

	// Sort: faucet tokens first, then by value
	const sortedAssets = assets.toSorted((a, b) => {
		const aIsFaucet = FAUCET_TOKEN_ADDRESSES.has(a.address.toLowerCase())
		const bIsFaucet = FAUCET_TOKEN_ADDRESSES.has(b.address.toLowerCase())
		if (aIsFaucet && !bIsFaucet) return -1
		if (!aIsFaucet && bIsFaucet) return 1
		return (b.valueUsd ?? 0) - (a.valueUsd ?? 0)
	})

	return (
		<>
			<div className="text-[13px] -mx-2 flex flex-col">
				{sortedAssets.map((asset) => (
					<AssetRow
						key={asset.address}
						asset={asset}
						address={address}
						isFaucetToken={FAUCET_TOKEN_ADDRESSES.has(
							asset.address.toLowerCase(),
						)}
						isExpanded={sendingToken === asset.address}
						onToggleSend={() => {
							if (!isOwnProfile) {
								if (connectedAddress) {
									navigate({
										to: '/$address',
										params: { address: connectedAddress },
										search: {
											sendTo: address,
											token: asset.address,
										},
									})
								} else {
									navigate({ to: '/' })
								}
								return
							}
							onSendingTokenChange(
								sendingToken === asset.address ? null : asset.address,
							)
						}}
						onSendComplete={(symbol) => {
							setToastMessage(`Sent ${symbol} successfully`)
							onOptimisticClear?.(asset.address)
							onSendSuccess?.()
							// Delay collapsing form to show success state
							setTimeout(() => onSendingTokenChange(null), 1500)
						}}
						onSendError={() => {
							onOptimisticClear?.(asset.address)
						}}
						onOptimisticSend={onOptimisticSend}
						onFaucetSuccess={onFaucetSuccess}
						isOwnProfile={isOwnProfile}
						initialRecipient={
							asset.address === sendingToken ? initialSendTo : undefined
						}
						announce={announce}
						accessKeys={signableAccessKeys}
					/>
				))}
			</div>
			{toastMessage &&
				createPortal(
					<LiveRegion>
						<div className="fixed bottom-4 right-4 z-50 bg-surface rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.12)] overflow-hidden flex">
							<div className="w-1 bg-positive shrink-0" />
							<div className="flex items-center gap-1.5 px-3 py-2">
								<CheckIcon className="size-[14px] text-positive" />
								<span className="text-[13px] text-primary font-medium">
									{toastMessage}
								</span>
							</div>
						</div>
					</LiveRegion>,
					document.body,
				)}
		</>
	)
}

function BouncingDots() {
	return (
		<span className="inline-flex gap-[3px] animate-[fadeIn_0.2s_ease-out]">
			<span className="size-[5px] bg-current rounded-full animate-[pulse_1s_ease-in-out_infinite] opacity-60" />
			<span className="size-[5px] bg-current rounded-full animate-[pulse_1s_ease-in-out_0.15s_infinite] opacity-60" />
			<span className="size-[5px] bg-current rounded-full animate-[pulse_1s_ease-in-out_0.3s_infinite] opacity-60" />
		</span>
	)
}

function FillingDroplet() {
	const id = React.useId()
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="text-accent"
			aria-hidden="true"
		>
			<title>Loading</title>
			<defs>
				<clipPath id={`droplet-clip-${id}`}>
					<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
				</clipPath>
			</defs>
			<path
				d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>
			<g clipPath={`url(#droplet-clip-${id})`}>
				<rect
					x="0"
					y="24"
					width="24"
					height="24"
					fill="currentColor"
					opacity="0.5"
					className="animate-fill-up-rect"
				/>
			</g>
		</svg>
	)
}

function SignWithSelector({
	accessKeys,
	selectedKey,
	onSelect,
	asset,
}: {
	accessKeys: AccessKeyData[]
	selectedKey: string | null
	onSelect: (keyId: string | null) => void
	asset: AssetData
}) {
	const { t } = useTranslation()
	const [isOpen, setIsOpen] = React.useState(false)
	const buttonRef = React.useRef<HTMLButtonElement>(null)
	const dropdownRef = React.useRef<HTMLDivElement>(null)

	React.useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node
			if (
				buttonRef.current &&
				!buttonRef.current.contains(target) &&
				dropdownRef.current &&
				!dropdownRef.current.contains(target)
			) {
				setIsOpen(false)
			}
		}
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
			return () => document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen])

	const getKeyName = (keyId: string): string => {
		try {
			const stored = localStorage.getItem(`accessKey:${keyId.toLowerCase()}`)
			if (stored) {
				const data = JSON.parse(stored) as { name?: string }
				if (data.name) return data.name
			}
		} catch {
			/* ignore */
		}
		return `${keyId.slice(0, 6)}...${keyId.slice(-4)}`
	}

	const getKeyLimit = (key: AccessKeyData): string | null => {
		const tokenAddr = asset.address.toLowerCase()
		const remainingLimit = key.spendingLimits.get(tokenAddr)
		if (remainingLimit === undefined) return null
		if (remainingLimit <= 0n) return t('common.exhausted')
		const decimals = asset.metadata?.decimals ?? 6
		const formatted = formatUnits(remainingLimit, decimals)
		return `$${Number(formatted).toFixed(0)}`
	}

	const updatePosition = React.useCallback(() => {
		if (buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect()
			// Use button width as minimum, but allow dropdown to be wider for content
			const dropdownWidth = Math.max(rect.width, 160)
			return {
				top: rect.bottom + 4,
				left: rect.left,
				width: dropdownWidth,
			}
		}
		return null
	}, [])

	const [dropdownPos, setDropdownPos] = React.useState<{
		top: number
		left: number
		width: number
	} | null>(null)

	React.useEffect(() => {
		if (!isOpen) return
		const handleScroll = () => {
			const pos = updatePosition()
			if (pos) setDropdownPos(pos)
		}
		window.addEventListener('scroll', handleScroll, true)
		window.addEventListener('resize', handleScroll)
		return () => {
			window.removeEventListener('scroll', handleScroll, true)
			window.removeEventListener('resize', handleScroll)
		}
	}, [isOpen, updatePosition])

	const openDropdown = () => {
		const pos = updatePosition()
		if (pos) {
			setDropdownPos(pos)
			setIsOpen(true)
		}
	}

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
				className={cx(
					'h-[34px] px-2 rounded-lg border bg-white/5 text-[12px] flex items-center gap-1.5 transition-colors cursor-pointer',
					isOpen
						? 'border-accent'
						: 'border-card-border hover:border-accent/50',
					selectedKey ? 'text-accent' : 'text-primary',
				)}
			>
				<span className="text-[13px] shrink-0">
					{selectedKey ? getAccessKeyEmoji(selectedKey) || '🔑' : '✨'}
				</span>
				<span className="truncate">
					{selectedKey ? getKeyName(selectedKey) : t('common.primary')}
				</span>
				<ChevronDownIcon
					className={cx(
						'size-2 text-tertiary transition-transform shrink-0',
						isOpen && 'rotate-180',
					)}
				/>
			</button>
			{isOpen &&
				dropdownPos &&
				createPortal(
					<div
						ref={dropdownRef}
						className="fixed bg-surface border border-card-border rounded-lg shadow-xl overflow-hidden py-1"
						style={{
							top: dropdownPos.top,
							left: dropdownPos.left,
							minWidth: dropdownPos.width,
							zIndex: 99999,
						}}
					>
						<button
							type="button"
							onClick={() => {
								onSelect(null)
								setIsOpen(false)
							}}
							className={cx(
								'w-full px-2 py-1.5 text-[12px] text-left hover:bg-base-alt transition-colors cursor-pointer flex items-center gap-1.5',
								!selectedKey ? 'text-accent' : 'text-primary',
							)}
						>
							<span className="text-[12px]">✨</span>
							<span>{t('common.primary')}</span>
						</button>
						{accessKeys.map((key) => {
							const limit = getKeyLimit(key)
							const isExhausted = limit === t('common.exhausted')
							const keyEmoji = getAccessKeyEmoji(key.keyId) || '🔑'
							const now = Date.now()
							const isExpired = key.expiry > 0 && key.expiry * 1000 < now
							const isAvailable = !isExhausted && !isExpired
							return (
								<button
									key={key.keyId}
									type="button"
									onClick={() => {
										if (isAvailable) {
											onSelect(key.keyId)
											setIsOpen(false)
										}
									}}
									disabled={!isAvailable}
									className={cx(
										'w-full px-2 py-1.5 text-[12px] text-left transition-colors flex items-center gap-1.5',
										!isAvailable
											? 'text-tertiary cursor-not-allowed opacity-50'
											: 'hover:bg-base-alt cursor-pointer',
										selectedKey === key.keyId ? 'text-accent' : 'text-primary',
									)}
								>
									<span
										className={cx(
											'size-[5px] rounded-full shrink-0',
											isAvailable ? 'bg-green-500' : 'bg-gray-500',
										)}
									/>
									<span className="text-[12px]">{keyEmoji}</span>
									<span className="truncate flex-1 min-w-0">
										{getKeyName(key.keyId)}
									</span>
									{limit && (
										<span
											className={cx(
												'text-[10px] tabular-nums shrink-0',
												isExhausted ? 'text-negative' : 'text-secondary',
											)}
										>
											{limit}
										</span>
									)}
								</button>
							)
						})}
					</div>,
					document.body,
				)}
		</>
	)
}

function AssetRow({
	asset,
	address,
	isFaucetToken,
	isExpanded,
	onToggleSend,
	onSendComplete,
	onSendError,
	onOptimisticSend,
	onFaucetSuccess,
	isOwnProfile,
	initialRecipient,
	announce,
	accessKeys,
}: {
	asset: AssetData
	address: string
	isFaucetToken: boolean
	isExpanded: boolean
	onToggleSend: () => void
	onSendComplete: (symbol: string) => void
	onSendError?: () => void
	onOptimisticSend?: (tokenAddress: string, amount: bigint) => void
	onFaucetSuccess?: () => void
	isOwnProfile: boolean
	initialRecipient?: string
	announce: (message: string) => void
	accessKeys: AccessKeyData[]
}) {
	const { t } = useTranslation()
	const [recipient, setRecipient] = React.useState(initialRecipient ?? '')
	const [amount, setAmount] = React.useState('')
	const [sendState, setSendState] = React.useState<
		'idle' | 'sending' | 'sent' | 'error'
	>('idle')
	const [sendError, setSendError] = React.useState<string | null>(null)
	const [faucetState, setFaucetState] = React.useState<
		'idle' | 'loading' | 'done'
	>('idle')
	const [faucetInitialBalance, setFaucetInitialBalance] = React.useState<
		string | null
	>(null)
	const [pendingSendAmount, setPendingSendAmount] = React.useState<
		bigint | null
	>(null)
	const [selectedAccessKey, setSelectedAccessKey] = React.useState<
		string | null
	>(null)
	const recipientInputRef = React.useRef<HTMLInputElement>(null)
	const amountInputRef = React.useRef<HTMLInputElement>(null)
	const { data: connectorClient } = useConnectorClient()

	const {
		writeContract,
		data: txHash,
		isPending,
		error: writeError,
		reset: resetWrite,
	} = useWriteContract()
	const { isLoading: isConfirming, isSuccess: isConfirmed } =
		useWaitForTransactionReceipt({
			hash: txHash,
		})

	// Apply optimistic update when txHash appears (wallet signed)
	React.useEffect(() => {
		if (txHash && pendingSendAmount) {
			onOptimisticSend?.(asset.address, pendingSendAmount)
		}
	}, [txHash, pendingSendAmount, asset.address, onOptimisticSend])

	// Handle transaction confirmation
	React.useEffect(() => {
		if (isConfirmed) {
			setSendState('sent')
			setPendingSendAmount(null)
			announce(t('a11y.transactionSent'))
			// Trigger balance refresh and close form immediately via onSendComplete
			onSendComplete(asset.metadata?.symbol || shortenAddress(asset.address, 3))
			// Reset UI state after animation (form already closed by onSendComplete)
			setTimeout(() => {
				setSendState('idle')
				setRecipient('')
				setAmount('')
				resetWrite()
			}, 1500)
		}
	}, [
		isConfirmed,
		asset.metadata?.symbol,
		asset.address,
		onSendComplete,
		resetWrite,
		announce,
		t,
	])

	// Handle write errors
	React.useEffect(() => {
		if (writeError) {
			setSendState('error')
			setPendingSendAmount(null)
			const shortMessage =
				'shortMessage' in writeError
					? (writeError.shortMessage as string)
					: writeError.message
			setSendError(shortMessage || t('common.transactionFailed'))
			// Revert optimistic update on error
			onSendError?.()
			setTimeout(() => {
				setSendState('idle')
				setSendError(null)
				resetWrite()
			}, 3000)
		}
	}, [writeError, resetWrite, onSendError, t])

	// Update send state based on pending/confirming
	React.useEffect(() => {
		if (isPending || isConfirming) {
			setSendState('sending')
		}
	}, [isPending, isConfirming])

	// Watch for balance changes while faucet is loading
	React.useEffect(() => {
		if (faucetState !== 'loading' || faucetInitialBalance === null) return
		if (asset.balance !== faucetInitialBalance) {
			setFaucetState('done')
			setFaucetInitialBalance(null)
			announce(t('a11y.faucetSuccess'))
			setTimeout(() => setFaucetState('idle'), 1500)
		}
	}, [asset.balance, faucetState, faucetInitialBalance, announce, t])

	// Poll for balance updates while faucet is loading (but not during send)
	React.useEffect(() => {
		if (faucetState !== 'loading') return
		if (sendState === 'sending') return
		const interval = setInterval(() => {
			onFaucetSuccess?.()
		}, 1500)
		return () => clearInterval(interval)
	}, [faucetState, sendState, onFaucetSuccess])

	const handleFaucet = async () => {
		if (faucetState !== 'idle') return
		setFaucetInitialBalance(asset.balance ?? null)
		setFaucetState('loading')
		try {
			const result = await faucetFundAddress({ data: { address } })
			if (!result.success) {
				console.error('Faucet error:', result.error)
				setFaucetState('idle')
				setFaucetInitialBalance(null)
				return
			}
			// Trigger first refresh
			onFaucetSuccess?.()
		} catch (err) {
			console.error('Faucet error:', err)
			setFaucetState('idle')
			setFaucetInitialBalance(null)
		}
	}

	React.useEffect(() => {
		if (isExpanded) {
			if (initialRecipient && amountInputRef.current) {
				amountInputRef.current.focus()
			} else if (recipientInputRef.current) {
				recipientInputRef.current.focus()
			}
		}
	}, [isExpanded, initialRecipient])

	React.useEffect(() => {
		if (!isExpanded) return
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onToggleSend()
			}
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [isExpanded, onToggleSend])

	React.useEffect(() => {
		if (sendState === 'sent') {
			setShowToast(true)
			const timeout = setTimeout(() => setShowToast(false), 2000)
			return () => clearTimeout(timeout)
		}
	}, [sendState])

	const handleSend = async () => {
		if (!isValidSend || parsedAmount === 0n) return

		// If an access key is selected, use it to sign the transaction
		if (selectedAccessKey && connectorClient?.chain) {
			setSendState('sending')
			try {
				// Get the access key from localStorage (stored when created)
				const storedKey = localStorage.getItem(
					`accessKey:${selectedAccessKey.toLowerCase()}`,
				)
				if (!storedKey) {
					setSendError(t('a11y.accessKeyNotFound'))
					setSendState('error')
					setTimeout(() => {
						setSendState('idle')
						setSendError(null)
					}, 3000)
					return
				}

				const keyData = JSON.parse(storedKey) as { privateKey: string }
				const privateKeyBytes = Uint8Array.from(atob(keyData.privateKey), (c) =>
					c.charCodeAt(0),
				)

				// Import the private key
				const privateKey = await crypto.subtle.importKey(
					'pkcs8',
					privateKeyBytes,
					{ name: 'ECDSA', namedCurve: 'P-256' },
					true,
					['sign'],
				)

				// Derive the public key from private key via JWK
				const jwk = await crypto.subtle.exportKey('jwk', privateKey)
				// Remove private key 'd' and key_ops so we can import as public key with 'verify'
				const publicJwk = { ...jwk, d: undefined, key_ops: undefined }
				const cryptoPublicKey = await crypto.subtle.importKey(
					'jwk',
					publicJwk,
					{ name: 'ECDSA', namedCurve: 'P-256' },
					true,
					['verify'],
				)

				// Export to raw format and convert to ox PublicKey format
				const publicKeyRaw = await crypto.subtle.exportKey(
					'raw',
					cryptoPublicKey,
				)
				const publicKey = PublicKey.from(new Uint8Array(publicKeyRaw))

				// Create the access key account with reconstructed key pair
				const accessKeyAccount = TempoAccount.fromWebCryptoP256(
					{ privateKey, publicKey },
					{ access: connectorClient.account },
				)

				// Create a client with the access key
				const accessKeyClient = createClient({
					account: accessKeyAccount,
					chain: connectorClient.chain,
					transport: http(),
				})

				// Send transfer using the access key
				const hash = await sendTransaction(accessKeyClient, {
					to: asset.address as `0x${string}`,
					data: encodeFunctionData({
						abi: erc20Abi,
						functionName: 'transfer',
						args: [recipient as `0x${string}`, parsedAmount],
					}),
					feeToken: '0x20c000000000000000000000033abb6ac7d235e5',
				})

				// Wait for confirmation manually since we're not using wagmi's writeContract
				const chain = getTempoChain()
				const publicClient = createPublicClient({ chain, transport: http() })
				await publicClient.waitForTransactionReceipt({ hash })

				setSendState('sent')
				setTimeout(() => {
					setSendState('idle')
					setRecipient('')
					setAmount('')
					setSelectedAccessKey(null)
					onSendComplete(
						asset.metadata?.symbol || shortenAddress(asset.address, 3),
					)
				}, 1500)
			} catch (e) {
				console.error('[AssetRow] Access key send error:', e)
				setSendError(
					e instanceof Error ? e.message : t('common.transactionFailed'),
				)
				setSendState('error')
				setTimeout(() => {
					setSendState('idle')
					setSendError(null)
				}, 3000)
			}
			return
		}

		// Default: use wallet to sign
		setPendingSendAmount(parsedAmount)
		writeContract({
			address: asset.address as `0x${string}`,
			abi: erc20Abi,
			functionName: 'transfer',
			args: [recipient as `0x${string}`, parsedAmount],
		})
	}

	const handleToggle = () => {
		onToggleSend()
	}

	const handleMax = () => {
		if (asset.balance && asset.metadata?.decimals !== undefined) {
			setAmount(formatAmount(asset.balance, asset.metadata.decimals))
		}
	}
	const isValidRecipient = /^0x[a-fA-F0-9]{40}$/.test(recipient)
	const parsedAmount = React.useMemo(() => {
		if (!amount || !asset.metadata?.decimals) return 0n
		try {
			return parseUnits(amount, asset.metadata.decimals)
		} catch {
			return 0n
		}
	}, [amount, asset.metadata?.decimals])
	const isValidAmount =
		amount.length > 0 &&
		!Number.isNaN(Number(amount)) &&
		Number(amount) > 0 &&
		parsedAmount > 0n &&
		asset.balance !== undefined &&
		parsedAmount <= BigInt(asset.balance)
	const isValidSend = isValidRecipient && isValidAmount

	const ROW_HEIGHT = 48

	if (isExpanded) {
		return (
			<form
				onSubmit={(e) => {
					e.preventDefault()
					handleSend()
				}}
				className="flex flex-col gap-2 px-1 py-2 rounded-xl hover:glass-thin transition-all"
			>
				{/* Row 1: Address input */}
				<div className="flex items-center gap-1.5 px-1">
					<div className="flex items-center flex-1 h-[34px] rounded-lg border border-card-border bg-white/5 focus-within:border-accent">
						<input
							ref={recipientInputRef}
							type="text"
							value={recipient}
							onChange={(e) => setRecipient(e.target.value)}
							placeholder="0x..."
							className="flex-1 min-w-0 h-full px-2 bg-transparent text-[13px] text-primary font-mono placeholder:text-tertiary focus:outline-none"
						/>
					</div>
				</div>
				{/* Row 2: Amount + Key selector + send button */}
				<div className="flex items-center gap-1.5 px-1">
					{/* Compound amount input */}
					<div className="flex items-center flex-1 h-[34px] rounded-lg border border-card-border bg-white/5 focus-within:border-accent">
						<TokenIcon
							address={asset.address}
							className="size-[16px] shrink-0 ml-1.5 brightness-125"
						/>
						<input
							ref={amountInputRef}
							type="text"
							inputMode="decimal"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							placeholder="0.00"
							className="flex-1 min-w-[40px] h-full px-1.5 bg-transparent text-[15px] text-primary font-mono placeholder:text-tertiary focus:outline-none"
						/>
						<span className="text-[11px] text-tertiary font-medium shrink-0 pr-1">
							{asset.metadata?.symbol || '???'}
						</span>
						<button
							type="button"
							onClick={handleMax}
							className="h-full px-2 border-l border-card-border text-[10px] font-medium text-accent hover:bg-base-alt cursor-pointer transition-colors shrink-0"
						>
							MAX
						</button>
					</div>
					<SignWithSelector
						accessKeys={accessKeys}
						selectedKey={selectedAccessKey}
						onSelect={setSelectedAccessKey}
						asset={asset}
					/>
					<button
						type="submit"
						aria-label={t('common.send')}
						aria-busy={sendState === 'sending'}
						className={cx(
							'size-[34px] rounded-lg press-down transition-colors flex items-center justify-center shrink-0 focus-ring',
							sendState === 'sent'
								? 'bg-positive text-white cursor-default'
								: sendState === 'error'
									? 'bg-negative text-white cursor-default'
									: isValidSend && sendState === 'idle'
										? 'bg-accent text-white hover:bg-accent/90 cursor-pointer'
										: 'bg-base-alt text-tertiary cursor-not-allowed',
						)}
						disabled={!isValidSend || sendState !== 'idle'}
					>
						{sendState === 'sending' ? (
							<BouncingDots />
						) : sendState === 'sent' ? (
							<CheckIcon className="size-[14px]" />
						) : sendState === 'error' ? (
							<XIcon className="size-[14px]" />
						) : (
							<SendIcon className="size-[14px]" />
						)}
					</button>
				</div>
				{sendError && (
					<div className="pl-[30px] text-[10px] text-negative truncate">
						{sendError}
					</div>
				)}
			</form>
		)
	}

	return (
		<div
			className="group grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_60px_auto] md:grid-cols-[1fr_auto_60px_90px_auto] gap-1 rounded-xl hover:glass-thin transition-all"
			style={{ height: ROW_HEIGHT }}
		>
			<span className="pl-1 pr-2 text-primary flex items-center gap-1.5">
				<TokenIcon
					address={asset.address}
					className="size-[36px] transition-transform group-hover:scale-105 mx-0.5"
				/>
				<span className="flex flex-col min-w-0">
					<span className="truncate font-medium">
						{asset.metadata?.name || shortenAddress(asset.address)}
					</span>
					<span className="text-[11px] text-tertiary font-mono truncate">
						{asset.metadata?.symbol || shortenAddress(asset.address, 3)}
					</span>
				</span>
			</span>
			<span
				className="px-2 flex items-center justify-end overflow-hidden min-w-0 relative"
				title={
					asset.balance !== undefined && asset.metadata?.decimals !== undefined
						? formatAmount(asset.balance, asset.metadata.decimals)
						: undefined
				}
			>
				<span
					className={cx(
						'flex flex-col items-end min-w-0 transition-opacity duration-300',
						faucetState === 'loading' && 'opacity-15',
					)}
				>
					<span className="text-primary font-sans text-[14px] tabular-nums text-right truncate max-w-full">
						{asset.balance !== undefined &&
						asset.metadata?.decimals !== undefined ? (
							formatAmount(asset.balance, asset.metadata.decimals)
						) : (
							<span className="text-tertiary">…</span>
						)}
					</span>
					<span className="text-secondary text-[11px] md:hidden whitespace-nowrap">
						{asset.valueUsd !== undefined ? (
							formatUsdCompact(asset.valueUsd)
						) : (
							<span className="text-tertiary">−</span>
						)}
					</span>
				</span>
				{faucetState === 'loading' && (
					<span className="absolute inset-0 flex items-center justify-end pr-2">
						<BouncingDots />
					</span>
				)}
			</span>
			<span className="pl-1 hidden sm:flex items-center justify-start">
				<span className="text-[9px] font-medium text-tertiary bg-base-alt px-1 py-0.5 rounded font-mono whitespace-nowrap">
					{asset.metadata?.symbol || shortenAddress(asset.address, 3)}
				</span>
			</span>
			<span className="px-2 text-secondary hidden md:flex items-center justify-end">
				<span className="font-sans tabular-nums whitespace-nowrap">
					{asset.valueUsd !== undefined ? (
						formatUsdCompact(asset.valueUsd)
					) : (
						<span className="text-tertiary">−</span>
					)}
				</span>
			</span>
			<span className="pr-2 flex items-center justify-end gap-0.5 relative z-10">
				{isOwnProfile && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							if (isFaucetToken) handleFaucet()
						}}
						disabled={faucetState !== 'idle' || !isFaucetToken}
						className={cx(
							'flex items-center justify-center size-[24px] rounded-md transition-colors focus-ring',
							isFaucetToken
								? 'hover:bg-accent/10 cursor-pointer'
								: 'opacity-0 pointer-events-none',
						)}
						aria-label={isFaucetToken ? t('common.requestTokens') : undefined}
						aria-hidden={!isFaucetToken}
					>
						{faucetState === 'done' ? (
							<CheckIcon className="size-[14px] text-positive" />
						) : faucetState === 'loading' ? (
							<FillingDroplet />
						) : (
							<DropletIcon className="size-[14px] text-tertiary hover:text-accent transition-colors" />
						)}
					</button>
				)}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation()
						handleToggle()
					}}
					className="flex items-center justify-center size-[28px] rounded-md hover:bg-accent/10 cursor-pointer transition-all opacity-60 group-hover:opacity-100 focus-ring"
					aria-label={t('common.send')}
				>
					<SendIcon className="size-[14px] text-tertiary hover:text-accent transition-colors" />
				</button>
			</span>
		</div>
	)
}

type ActivityTab = 'mine' | 'everyone'

function ActivitySection({
	activity,
	address,
	currentBlock,
	tokenMetadataMap,
}: {
	activity: ActivityItem[]
	address: string
	currentBlock: bigint | null
	tokenMetadataMap: Map<Address.Address, { decimals: number; symbol: string }>
}) {
	const { t } = useTranslation()
	const [activeTab, setActiveTab] = React.useState<ActivityTab>('mine')
	const [selectedBlock, setSelectedBlock] = React.useState<bigint | undefined>()
	const [blockActivity, setBlockActivity] = React.useState<ActivityItem[]>([])

	const userTxHashes = React.useMemo(
		() => new Set(activity.map((a) => a.hash.toLowerCase())),
		[activity],
	)

	// Store tokenMetadataMap in a ref to avoid triggering effect on map changes
	const tokenMetadataMapRef = React.useRef(tokenMetadataMap)
	tokenMetadataMapRef.current = tokenMetadataMap

	// Track which block we're currently showing to avoid flicker
	const [loadedBlock, setLoadedBlock] = React.useState<bigint | undefined>()

	// Cache for fetched token metadata
	const fetchedTokenMetadataRef = React.useRef<
		Map<string, { name: string; symbol: string; decimals: number }>
	>(new Map())

	// Fetch block transactions when a block is selected in "Everyone" tab
	React.useEffect(() => {
		if (activeTab !== 'everyone' || selectedBlock === undefined) {
			return
		}

		// Clear previous block's activity immediately when selecting a new block
		if (loadedBlock !== selectedBlock) {
			setBlockActivity([])
		}

		let cancelled = false
		const loadBlockTxs = async () => {
			try {
				const result = await fetchBlockWithReceipts({
					data: { blockNumber: selectedBlock.toString() },
				})

				if (cancelled) return

				if (result.receipts.length > 0) {
					// Collect all token addresses from logs that we don't have metadata for
					const unknownTokens = new Set<string>()
					for (const receipt of result.receipts) {
						for (const log of receipt.logs) {
							const addr = log.address.toLowerCase()
							if (
								!tokenMetadataMapRef.current.has(addr as Address.Address) &&
								!fetchedTokenMetadataRef.current.has(addr)
							) {
								unknownTokens.add(addr)
							}
						}
					}

					// Fetch metadata for unknown tokens
					if (unknownTokens.size > 0 && !cancelled) {
						try {
							const metadataResult = await fetchTokenMetadata({
								data: { addresses: Array.from(unknownTokens) },
							})
							for (const [addr, meta] of Object.entries(
								metadataResult.tokens,
							)) {
								fetchedTokenMetadataRef.current.set(addr, meta)
							}
						} catch {
							// Ignore metadata fetch errors
						}
					}

					if (cancelled) return

					const getTokenMetadata: GetTokenMetadataFn = (tokenAddress) => {
						const addr = tokenAddress.toLowerCase()
						return (
							tokenMetadataMapRef.current.get(tokenAddress) ||
							fetchedTokenMetadataRef.current.get(addr)
						)
					}

					const items: ActivityItem[] = []
					for (const receipt of result.receipts) {
						let events: KnownEvent[] = []
						try {
							const viemReceipt = convertRpcReceiptToViemReceipt(receipt)
							events = parseKnownEvents(viemReceipt, {
								getTokenMetadata,
								viewer: receipt.from,
							})
						} catch {
							// parsing failed, show tx with empty events
						}

						// Detect system transactions if no events were parsed
						if (events.length === 0 && receipt.to) {
							const to = receipt.to.toLowerCase()
							if (to === '0x0000000000000000000000000000000000000000') {
								events = [
									{
										type: 'system',
										parts: [{ type: 'action', value: 'Subblock Metadata' }],
									},
								]
							}
						}

						items.push({
							hash: receipt.transactionHash,
							events,
							timestamp: result.timestamp,
							blockNumber: selectedBlock,
						})
					}
					setBlockActivity(items)
				} else {
					setBlockActivity([])
				}
				setLoadedBlock(selectedBlock)
			} catch {
				if (!cancelled) {
					setBlockActivity([])
					setLoadedBlock(selectedBlock)
				}
			}
		}

		loadBlockTxs()
		return () => {
			cancelled = true
		}
	}, [activeTab, selectedBlock, loadedBlock])

	// Clear selection when switching tabs
	React.useEffect(() => {
		if (activeTab === 'mine') {
			setSelectedBlock(undefined)
			setBlockActivity([])
		}
	}, [activeTab])

	const tabButtons = (
		<div className="flex items-center gap-3">
			<span
				role="button"
				tabIndex={0}
				onClick={(e) => {
					e.stopPropagation()
					setActiveTab('mine')
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.stopPropagation()
						setActiveTab('mine')
					}
				}}
				className={cx(
					'text-[12px] font-medium transition-all pb-0.5 border-b-2 cursor-pointer',
					activeTab === 'mine'
						? 'text-primary border-accent'
						: 'text-tertiary hover:text-primary border-transparent',
				)}
			>
				{t('portfolio.mine')}
			</span>
			<span
				role="button"
				tabIndex={0}
				onClick={(e) => {
					e.stopPropagation()
					setActiveTab('everyone')
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.stopPropagation()
						setActiveTab('everyone')
					}
				}}
				className={cx(
					'text-[12px] font-medium transition-all pb-0.5 border-b-2 cursor-pointer',
					activeTab === 'everyone'
						? 'text-primary border-accent'
						: 'text-tertiary hover:text-primary border-transparent',
				)}
			>
				{t('portfolio.everyone')}
			</span>
		</div>
	)

	return (
		<Section
			title={t('portfolio.activity')}
			externalLink={`https://explore.mainnet.tempo.xyz/address/${address}`}
			defaultOpen
			titleRight={tabButtons}
		>
			{activeTab === 'mine' ? (
				<>
					<ActivityHeatmap activity={activity} currentBlock={currentBlock} />
					<ActivityList
						activity={activity}
						address={address}
						filterBlockNumber={undefined}
					/>
				</>
			) : (
				<>
					<BlockTimeline
						activity={activity}
						currentBlock={currentBlock}
						selectedBlock={selectedBlock}
						onSelectBlock={setSelectedBlock}
					/>
					<div className="border-b border-border-tertiary -mx-4 mt-2 mb-3" />

					{selectedBlock === undefined ? (
						<div className="flex flex-col items-center justify-center min-h-[80px] py-6 gap-2">
							<div className="size-10 rounded-full bg-base-alt flex items-center justify-center">
								<BoxIcon className="size-5 text-tertiary" />
							</div>
							<p className="text-[13px] text-secondary">
								{t('portfolio.selectBlockToView') ||
									t('portfolio.selectBlockToViewTxs')}
							</p>
						</div>
					) : (
						<div>
							{blockActivity.length === 0 && loadedBlock === selectedBlock ? (
								<div className="flex flex-col items-center justify-center py-6 gap-2">
									<div className="size-10 rounded-full bg-base-alt flex items-center justify-center">
										<ReceiptIcon className="size-5 text-tertiary" />
									</div>
									<p className="text-[13px] text-secondary">
										{t('portfolio.noActivityInBlock')}
									</p>
									<a
										href={`https://explore.mainnet.tempo.xyz/block/${selectedBlock}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-[12px] text-accent hover:underline"
									>
										{t('portfolio.viewBlockInExplorer')}
									</a>
								</div>
							) : blockActivity.length > 0 ? (
								<BlockActivityList
									activity={blockActivity}
									address={address}
									userTxHashes={userTxHashes}
									blockNumber={loadedBlock ?? selectedBlock}
								/>
							) : (
								<div className="flex items-center justify-center min-h-[80px]">
									<RefreshCwIcon className="size-5 text-tertiary animate-spin" />
								</div>
							)}
						</div>
					)}
				</>
			)}
		</Section>
	)
}

function BlockActivityList({
	activity,
	address,
	userTxHashes,
	blockNumber,
}: {
	activity: ActivityItem[]
	address: string
	userTxHashes: Set<string>
	blockNumber: bigint
}) {
	const viewer = address as Address.Address
	const [page, setPage] = React.useState(0)

	const totalPages = Math.ceil(activity.length / ACTIVITY_PAGE_SIZE)
	const paginatedActivity = activity.slice(
		page * ACTIVITY_PAGE_SIZE,
		(page + 1) * ACTIVITY_PAGE_SIZE,
	)

	const transformEvent = (event: KnownEvent) =>
		getPerspectiveEvent(event, viewer)

	return (
		<div className="text-[13px] -mx-2">
			<div className="px-3 py-2 text-[11px] text-tertiary">
				Block {blockNumber.toString()} • {activity.length} transaction
				{activity.length !== 1 ? 's' : ''}
			</div>
			{paginatedActivity.map((item) => (
				<ActivityRow
					key={item.hash}
					item={item}
					viewer={viewer}
					transformEvent={transformEvent}
					isHighlighted={userTxHashes.has(item.hash.toLowerCase())}
				/>
			))}
			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-1 pt-3 pb-1">
					{Array.from({ length: totalPages }, (_, i) => (
						<button
							key={`block-activity-page-${i}`}
							type="button"
							onClick={() => setPage(i)}
							className={cx(
								'size-[28px] rounded-full text-[12px] cursor-pointer transition-all',
								page === i
									? 'bg-accent/15 text-accent'
									: 'hover:bg-base-alt text-tertiary',
							)}
						>
							{i + 1}
						</button>
					))}
				</div>
			)}
		</div>
	)
}

const ACTIVITY_PAGE_SIZE = 10

function ActivityList({
	activity,
	address,
	filterBlockNumber,
}: {
	activity: ActivityItem[]
	address: string
	filterBlockNumber?: bigint
}) {
	const viewer = address as Address.Address
	const { t } = useTranslation()
	const [page, setPage] = React.useState(0)

	const displayActivity = React.useMemo(() => {
		if (filterBlockNumber === undefined) return activity
		return activity.filter((item) => item.blockNumber === filterBlockNumber)
	}, [activity, filterBlockNumber])

	React.useEffect(() => {
		setPage(0)
	}, [])

	if (displayActivity.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-6 gap-2">
				<div className="size-10 rounded-full bg-base-alt flex items-center justify-center">
					<ReceiptIcon className="size-5 text-tertiary" />
				</div>
				<p className="text-[13px] text-secondary">
					{filterBlockNumber !== undefined
						? t('portfolio.noActivityInBlock')
						: t('portfolio.noActivityYet')}
				</p>
				{filterBlockNumber !== undefined && (
					<a
						href={`https://explore.mainnet.tempo.xyz/block/${filterBlockNumber}`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-[12px] text-accent hover:underline"
					>
						{t('portfolio.viewBlockInExplorer')}
					</a>
				)}
			</div>
		)
	}

	const totalPages = Math.ceil(displayActivity.length / ACTIVITY_PAGE_SIZE)
	const paginatedActivity = displayActivity.slice(
		page * ACTIVITY_PAGE_SIZE,
		(page + 1) * ACTIVITY_PAGE_SIZE,
	)

	const transformEvent = (event: KnownEvent) =>
		getPerspectiveEvent(event, viewer)

	return (
		<div className="text-[13px] -mx-2">
			{paginatedActivity.map((item) => (
				<ActivityRow
					key={item.hash}
					item={item}
					viewer={viewer}
					transformEvent={transformEvent}
					isHighlighted={filterBlockNumber !== undefined}
				/>
			))}
			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-1 pt-3 pb-1">
					{Array.from({ length: totalPages }, (_, i) => (
						<button
							key={`activity-page-${i}`}
							type="button"
							onClick={() => setPage(i)}
							className={cx(
								'size-[28px] rounded-full text-[12px] cursor-pointer transition-all',
								page === i
									? 'bg-accent/15 text-accent'
									: 'hover:bg-base-alt text-tertiary',
							)}
						>
							{i + 1}
						</button>
					))}
				</div>
			)}
		</div>
	)
}

function ActivityRow({
	item,
	viewer,
	transformEvent,
	isHighlighted,
}: {
	item: ActivityItem
	viewer: Address.Address
	transformEvent: (event: KnownEvent) => KnownEvent
	isHighlighted?: boolean
}) {
	const { t } = useTranslation()
	const [showModal, setShowModal] = React.useState(false)

	return (
		<>
			<div
				className={cx(
					'group flex items-center gap-2 px-3 h-[48px] transition-all',
					isHighlighted
						? 'bg-accent/10 -mx-3 px-6'
						: 'rounded-xl hover:glass-thin',
				)}
			>
				{isHighlighted && (
					<span className="size-1.5 rounded-full bg-accent shrink-0" />
				)}
				<TxDescription.ExpandGroup
					events={item.events}
					seenAs={viewer}
					transformEvent={transformEvent}
					limitFilter={preferredEventsFilter}
					emptyContent={
						<span className="flex items-center gap-1.5">
							<span className="text-secondary">{t('common.transaction')}</span>
							<span className="text-tertiary font-mono text-[11px]">
								{item.hash.slice(0, 10)}...
							</span>
						</span>
					}
				/>
				<div className="flex items-center gap-2 shrink-0">
					{item.timestamp && (
						<span className="text-[11px] text-tertiary font-mono tabular-nums">
							{formatActivityTime(item.timestamp)}
						</span>
					)}
					<a
						href={`https://explore.mainnet.tempo.xyz/tx/${item.hash}`}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center justify-center size-[24px] rounded-md hover:bg-base-alt shrink-0 transition-all opacity-60 group-hover:opacity-100 focus-ring"
						aria-label={t('common.viewOnExplorer')}
					>
						<ExternalLinkIcon className="size-[14px] text-tertiary hover:text-accent transition-colors" />
					</a>
					<button
						type="button"
						onClick={() => setShowModal(true)}
						className="flex items-center justify-center size-[24px] rounded-md hover:bg-base-alt shrink-0 cursor-pointer transition-all opacity-60 group-hover:opacity-100 focus-ring"
						aria-label={t('common.viewReceipt')}
					>
						<ReceiptIcon className="size-[14px] text-tertiary hover:text-accent transition-colors" />
					</button>
				</div>
			</div>
			{showModal &&
				createPortal(
					<TransactionModal
						hash={item.hash}
						events={item.events}
						viewer={viewer}
						transformEvent={transformEvent}
						onClose={() => setShowModal(false)}
					/>,
					document.body,
				)}
		</>
	)
}

function ReceiptMark() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={69}
			height={27}
			viewBox="0 0 92 36"
			fill="none"
		>
			<title>Tempo Receipt</title>
			<path
				className="fill-primary"
				d="M83.722 19.168c2.086 0 4.01-1.495 4.01-4.451s-1.924-4.45-4.01-4.45-4.01 1.494-4.01 4.45 1.925 4.45 4.01 4.45m0-12.747C88.438 6.42 92 9.885 92 14.716s-3.56 8.296-8.278 8.296c-4.717 0-8.277-3.497-8.277-8.296 0-4.8 3.56-8.296 8.277-8.296M62.376 29.098h-4.267v-22.2h4.139v1.908c.706-1.207 2.47-2.258 4.844-2.258 4.62 0 7.282 3.497 7.282 8.138 0 4.64-2.983 8.233-7.442 8.233-2.182 0-3.786-.86-4.556-1.908zm7.796-14.381c0-2.765-1.732-4.386-3.914-4.386s-3.945 1.621-3.945 4.386 1.765 4.418 3.945 4.418 3.914-1.622 3.914-4.418M36.74 22.539h-4.268V6.898h4.074v1.907c.867-1.526 2.887-2.352 4.62-2.352 2.15 0 3.883.922 4.685 2.606 1.252-1.907 2.919-2.606 5.004-2.606 2.919 0 5.71 1.749 5.71 5.944v10.14h-4.138v-9.281c0-1.685-.834-2.956-2.792-2.956-1.829 0-2.919 1.398-2.919 3.083v9.154H42.48v-9.281c0-1.685-.866-2.956-2.79-2.956s-2.95 1.367-2.95 3.083zm-16.964-9.601h7.058c-.064-1.557-1.09-3.083-3.53-3.083-2.213 0-3.432 1.653-3.528 3.083m7.476 4.068 3.56 1.049c-.802 2.702-3.304 4.958-7.186 4.958-4.33 0-8.15-3.084-8.15-8.36 0-4.991 3.723-8.233 7.765-8.233 4.876 0 7.796 3.083 7.796 8.106 0 .604-.065 1.24-.065 1.303H19.68c.097 2.066 1.86 3.56 3.979 3.56 1.989 0 3.08-.986 3.594-2.383"
			/>
			<path
				className="fill-primary"
				d="M18.833 4.164h-7.186v18.373h-4.46V4.164H0V0h18.833zm72.781 30.141v1.158h-33.81v-1.158zm0-3.182v1.157h-33.81v-1.157zm0-3.183v1.158H64.446V27.94zm-81.497 4.668H8.395v3.22H7.188v-8.253h2.894c1.721 0 2.784.96 2.784 2.522 0 1.075-.601 1.968-1.547 2.288l1.704 3.443h-1.365zm-1.722-4.021v3.06h1.518c1.103 0 1.727-.555 1.727-1.527s-.619-1.533-1.686-1.533zM19.58 34.77v1.058h-5.065v-8.253h5.065v1.058h-3.846v2.5h3.63v.995h-3.63v2.642zm4.555.138c1.05 0 1.715-.641 1.739-1.682h1.225c0 1.67-1.184 2.774-2.958 2.774-2.008 0-3.18-1.298-3.18-3.535v-1.527c0-2.237 1.172-3.535 3.18-3.535 1.82 0 2.935 1.081 2.958 2.894h-1.225c-.035-1.08-.735-1.802-1.745-1.802-1.26 0-1.92.841-1.92 2.443v1.527c0 1.602.66 2.442 1.926 2.442m9.503-.137v1.058h-5.065v-8.253h5.065v1.058h-3.845v2.5h3.63v.995h-3.63v2.642zm6.692 1.058h-4.646v-1.035H37.4V28.61h-1.716v-1.035h4.645v1.035h-1.715v6.183h1.715zm2.08-8.253h2.883c1.675 0 2.766 1.058 2.766 2.694 0 1.63-1.109 2.688-2.801 2.688H43.63v2.871h-1.22zm1.22 1.018v3.352h1.365c1.185 0 1.827-.59 1.827-1.676 0-1.093-.642-1.676-1.827-1.676zm9.042 7.235H51.46v-7.195h-2.504v-1.058h6.22v1.058h-2.503z"
			/>
		</svg>
	)
}

function shortenAddress(address: string, chars = 4): string {
	return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

function formatActivityTime(timestamp: number): string {
	const now = Date.now()
	const diff = now - timestamp

	const seconds = Math.floor(diff / 1000)
	const minutes = Math.floor(diff / 60000)
	const hours = Math.floor(diff / 3600000)
	const days = Math.floor(diff / 86400000)

	if (seconds < 60) return `${seconds}s`
	if (minutes < 60) return `${minutes}m`
	if (hours < 24) return `${hours}h`
	if (days < 7) return `${days}d`

	return new Date(timestamp).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
	})
}

function TransactionModal({
	hash,
	events,
	viewer,
	transformEvent,
	onClose,
}: {
	hash: string
	events: KnownEvent[]
	viewer: Address.Address
	transformEvent: (event: KnownEvent) => KnownEvent
	onClose: () => void
}) {
	const { t } = useTranslation()
	const [isVisible, setIsVisible] = React.useState(false)
	const overlayRef = React.useRef<HTMLDivElement>(null)
	const focusTrapRef = useFocusTrap(isVisible)

	const handleClose = React.useCallback(() => {
		setIsVisible(false)
		setTimeout(onClose, 200)
	}, [onClose])

	useEscapeKey(handleClose)

	React.useEffect(() => {
		requestAnimationFrame(() => setIsVisible(true))
	}, [])

	const blockNumber = React.useMemo(
		() => Math.floor(Math.random() * 1000000 + 5000000),
		[],
	)

	const timestamp = React.useMemo(() => new Date(), [])
	const formattedDate = timestamp.toLocaleDateString('en-US', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	})
	const formattedTime = timestamp.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	})

	const filteredEvents = React.useMemo(
		() => events.filter(preferredEventsFilter).map(transformEvent),
		[events, transformEvent],
	)

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop overlay
		<div
			ref={overlayRef}
			role="presentation"
			className={cx(
				'fixed inset-0 lg:left-[calc(45vw+16px)] z-50 flex items-center justify-center bg-base-background/95 backdrop-blur-md transition-opacity duration-200 p-4',
				isVisible ? 'opacity-100' : 'opacity-0',
			)}
			onClick={handleClose}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog handles keyboard via focus trap */}
			<div
				ref={focusTrapRef}
				role="dialog"
				aria-modal="true"
				aria-label={t('common.transactionReceipt')}
				className={cx(
					'flex flex-col items-center transition-all duration-200',
					isVisible
						? 'opacity-100 scale-100 translate-y-0'
						: 'opacity-0 scale-95 translate-y-4',
				)}
				onClick={(e) => e.stopPropagation()}
			>
				<div
					data-receipt
					className="flex flex-col w-full max-w-[360px] bg-white/5 border-b-0 rounded-[16px] rounded-br-none rounded-bl-none text-base-content"
				>
					<div className="flex flex-col sm:flex-row gap-4 sm:gap-[40px] px-4 sm:px-[20px] pt-5 sm:pt-[24px] pb-4 sm:pb-[16px]">
						<div className="shrink-0 self-center sm:self-start">
							<ReceiptMark />
						</div>
						<div className="flex flex-col gap-[8px] font-mono text-[12px] sm:text-[13px] leading-[16px] flex-1">
							<div className="flex justify-between items-end">
								<span className="text-tertiary">{t('receipt.block')}</span>
								<a
									href={`https://explore.mainnet.tempo.xyz/block/${blockNumber}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-accent text-right before:content-['#'] press-down"
								>
									{blockNumber}
								</a>
							</div>
							<div className="flex justify-between items-end gap-4">
								<span className="text-tertiary shrink-0">
									{t('receipt.sender')}
								</span>
								<a
									href={`https://explore.mainnet.tempo.xyz/address/${viewer}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-accent text-right press-down min-w-0 flex-1 flex justify-end"
								>
									{shortenAddress(viewer)}
								</a>
							</div>
							<div className="flex justify-between items-end">
								<span className="text-tertiary shrink-0">
									{t('receipt.hash')}
								</span>
								<span className="text-right">{shortenAddress(hash, 6)}</span>
							</div>
							<div className="flex justify-between items-end">
								<span className="text-tertiary">{t('receipt.date')}</span>
								<span className="text-right">{formattedDate}</span>
							</div>
							<div className="flex justify-between items-end">
								<span className="text-tertiary">{t('receipt.time')}</span>
								<span className="text-right">{formattedTime}</span>
							</div>
						</div>
					</div>

					{filteredEvents.length > 0 && (
						<>
							<div className="border-t border-dashed border-base-border" />
							<div className="flex flex-col gap-3 px-4 sm:px-[20px] py-4 sm:py-[16px] font-mono text-[12px] sm:text-[13px] leading-4 [counter-reset:event]">
								{filteredEvents.map((event, index) => (
									<div
										key={`${event.type}-${index}`}
										className="[counter-increment:event]"
									>
										<div className="flex flex-col gap-[8px]">
											<div className="flex flex-row items-start gap-[4px] grow min-w-0 text-tertiary">
												<div className="flex items-center text-tertiary before:content-[counter(event)_'.'] shrink-0 leading-[24px] min-w-[20px]" />
												<TxDescription
													event={event}
													seenAs={viewer}
													className="flex flex-row items-center gap-[6px] leading-[24px]"
												/>
											</div>
										</div>
									</div>
								))}
							</div>
						</>
					)}
				</div>

				<div className="w-full max-w-[360px]">
					<a
						href={`https://explore.mainnet.tempo.xyz/tx/${hash}`}
						target="_blank"
						rel="noopener noreferrer"
						className="press-down text-[13px] font-sans px-[12px] py-[12px] flex items-center justify-center gap-[8px] bg-white/5 hover:bg-white/10 rounded-bl-[16px] rounded-br-[16px] text-tertiary hover:text-primary transition-colors"
					>
						<span>{t('common.viewTransaction')}</span>
						<span aria-hidden="true">→</span>
					</a>
				</div>
			</div>
		</div>
	)
}
