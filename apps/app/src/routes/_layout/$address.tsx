import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { waapi, spring } from 'animejs'
import type { Address } from 'ox'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { encode } from 'uqr'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import {
	useAccount,
	useDisconnect,
	useWriteContract,
	useWaitForTransactionReceipt,
} from 'wagmi'
import {
	TxDescription,
	parseKnownEvents,
	preferredEventsFilter,
	getPerspectiveEvent,
	type KnownEvent,
	type GetTokenMetadataFn,
} from '#comps/activity'
import { Layout } from '#comps/Layout'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import { useActivitySummary, type ActivityType } from '#lib/activity-context'
import { LottoNumber } from '#comps/LottoNumber'
import {
	Settings,
	SETTINGS_VIEW_TITLES,
	type SettingsView,
} from '#comps/Settings'
import CopyIcon from '~icons/lucide/copy'
import ExternalLinkIcon from '~icons/lucide/external-link'
import GlobeIcon from '~icons/lucide/globe'
import ArrowLeftIcon from '~icons/lucide/arrow-left'
import CheckIcon from '~icons/lucide/check'
import PlusIcon from '~icons/lucide/plus'
import MinusIcon from '~icons/lucide/minus'
import SendIcon from '~icons/lucide/send'
import EyeIcon from '~icons/lucide/eye'
import EyeOffIcon from '~icons/lucide/eye-off'

import ReceiptIcon from '~icons/lucide/receipt'
import XIcon from '~icons/lucide/x'
import SearchIcon from '~icons/lucide/search'
import LogOutIcon from '~icons/lucide/log-out'
import LogInIcon from '~icons/lucide/log-in'
import DropletIcon from '~icons/lucide/droplet'
import { useTranslation } from 'react-i18next'
import i18n, { isRtl } from '#lib/i18n'

const BALANCES_API_URL = import.meta.env.VITE_BALANCES_API_URL
const TOKENLIST_API_URL = 'https://tokenlist.tempo.xyz'

// Tokens that can be funded via the faucet
const FAUCET_TOKEN_ADDRESSES = new Set([
	'0x20c000000000000000000000033abb6ac7d235e5', // DONOTUSE
])

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

type TokenMetadata = {
	address: string
	name: string
	symbol: string
	decimals: number
	currency: string
	priceUsd: number
}

type BalanceEntry = {
	token: string
	balance: string
	valueUsd: number
}

type AssetData = {
	address: Address.Address
	metadata:
		| { name?: string; symbol?: string; decimals?: number; priceUsd?: number }
		| undefined
	balance: string | undefined
	valueUsd: number | undefined
}

type TokenListToken = {
	name: string
	symbol: string
	decimals: number
	chainId: number
	address: string
	logoURI?: string
}

type TokenListResponse = {
	tokens: TokenListToken[]
}

function generateMockBalance(
	address: string,
	decimals: number,
): { balance: string; valueUsd: number } {
	const hash = address
		.toLowerCase()
		.split('')
		.reduce((acc, char) => acc + char.charCodeAt(0), 0)
	const rand = (hash % 100) / 100

	if (rand < 0.3) {
		return { balance: '0', valueUsd: 0 }
	}

	const multiplier = 10 ** decimals
	const amounts = [
		0.5 * multiplier,
		1.25 * multiplier,
		10 * multiplier,
		25 * multiplier,
		100 * multiplier,
		500 * multiplier,
		1250 * multiplier,
		5000 * multiplier,
	]
	const amount = amounts[hash % amounts.length]
	const balance = Math.floor(amount + rand * amount * 0.5).toString()
	const valueUsd = (Number(balance) / multiplier) * 1

	return { balance, valueUsd }
}

async function fetchAssets(
	accountAddress: Address.Address,
): Promise<AssetData[]> {
	if (BALANCES_API_URL) {
		const [tokensRes, balancesRes] = await Promise.all([
			fetch(`${BALANCES_API_URL}tokens`).catch(() => null),
			fetch(`${BALANCES_API_URL}balances/${accountAddress}`).catch(() => null),
		])

		if (tokensRes?.ok && balancesRes?.ok) {
			const tokens = (await tokensRes.json()) as TokenMetadata[]
			const balances = (await balancesRes.json()) as BalanceEntry[]

			const balanceMap = new Map(
				balances.map((b) => [
					b.token.toLowerCase(),
					{ balance: b.balance, valueUsd: b.valueUsd },
				]),
			)

			return tokens.map((token) => {
				const balanceData = balanceMap.get(token.address.toLowerCase())
				return {
					address: token.address as Address.Address,
					metadata: {
						name: token.name,
						symbol: token.symbol,
						decimals: token.decimals,
						priceUsd: token.priceUsd,
					},
					balance: balanceData?.balance ?? '0',
					valueUsd: balanceData?.valueUsd ?? 0,
				}
			})
		}
	}

	try {
		const tokenlistRes = await fetch(`${TOKENLIST_API_URL}/list/42429`).catch(
			() => null,
		)
		if (!tokenlistRes?.ok) return []

		const tokenlist = (await tokenlistRes.json()) as TokenListResponse
		const tokens = tokenlist.tokens ?? []

		return tokens.map((token) => {
			const mockData = generateMockBalance(
				`${accountAddress}${token.address}`,
				token.decimals,
			)
			return {
				address: token.address as Address.Address,
				metadata: {
					name: token.name,
					symbol: token.symbol,
					decimals: token.decimals,
					priceUsd: 1,
				},
				balance: mockData.balance,
				valueUsd: mockData.valueUsd,
			}
		})
	} catch {
		return []
	}
}

type ApiTransaction = {
	hash: string
	from: string
	to: string | null
	value: string
	blockNumber: string
	timestamp?: string
}

const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV

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
		const rpcUrl =
			TEMPO_ENV === 'presto'
				? 'https://rpc.presto.tempo.xyz'
				: 'https://rpc.tempo.xyz'

		const { env } = await import('cloudflare:workers')
		const auth = env.PRESTO_RPC_AUTH as string | undefined
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		}
		if (auth && TEMPO_ENV === 'presto') {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		const receipts: Array<{
			hash: string
			receipt: RpcTransactionReceipt | null
		}> = []

		for (const hash of hashes) {
			try {
				const response = await fetch(rpcUrl, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'eth_getTransactionReceipt',
						params: [hash],
					}),
				})
				if (response.ok) {
					const json = (await response.json()) as {
						result?: RpcTransactionReceipt
					}
					receipts.push({ hash, receipt: json.result ?? null })
				} else {
					receipts.push({ hash, receipt: null })
				}
			} catch {
				receipts.push({ hash, receipt: null })
			}
		}

		return { receipts }
	})

// Unused - keeping for future block timeline feature
// const fetchCurrentBlockNumber = createServerFn({ method: 'GET' }).handler(
// 	async () => {
// 		const rpcUrl =
// 			TEMPO_ENV === 'presto'
// 				? 'https://rpc.presto.tempo.xyz'
// 				: 'https://rpc.tempo.xyz'
//
// 		const { env } = await import('cloudflare:workers')
// 		const auth = env.PRESTO_RPC_AUTH as string | undefined
// 		const headers: Record<string, string> = {
// 			'Content-Type': 'application/json',
// 		}
// 		if (auth && TEMPO_ENV === 'presto') {
// 			headers.Authorization = `Basic ${btoa(auth)}`
// 		}
//
// 		try {
// 			const response = await fetch(rpcUrl, {
// 				method: 'POST',
// 				headers,
// 				body: JSON.stringify({
// 					jsonrpc: '2.0',
// 					id: 1,
// 					method: 'eth_blockNumber',
// 					params: [],
// 				}),
// 			})
// 			if (response.ok) {
// 				const json = (await response.json()) as { result?: string }
// 				if (json.result) {
// 					return { blockNumber: json.result }
// 				}
// 			}
// 			return { blockNumber: null }
// 		} catch {
// 			return { blockNumber: null }
// 		}
// 	},
// )

const fetchTransactionsFromExplorer = createServerFn({ method: 'GET' })
	.inputValidator((data: { address: string }) => data)
	.handler(async ({ data }) => {
		const { address } = data
		const explorerUrl =
			TEMPO_ENV === 'presto'
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

		console.log('[Activity] Explorer result:', {
			error: result.error,
			txCount: result.transactions.length,
		})

		if (result.error || result.transactions.length === 0) {
			console.log('[Activity] Returning empty - error or no txs')
			return []
		}

		const txData = result.transactions.slice(0, 50) as Array<{
			hash: string
			timestamp?: string
		}>
		const hashes = txData.map((tx) => tx.hash)

		const receiptsResult = await fetchTransactionReceipts({ data: { hashes } })

		console.log('[Activity] Receipts result:', {
			count: receiptsResult.receipts.length,
			withReceipt: receiptsResult.receipts.filter((r) => r.receipt).length,
		})

		const getTokenMetadata: GetTokenMetadataFn = (tokenAddress) => {
			return tokenMetadataMap.get(tokenAddress)
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
				const timestamp = txInfo?.timestamp
					? new Date(txInfo.timestamp).getTime()
					: Date.now()
				const blockNumber = BigInt(rpcReceipt.blockNumber)
				items.push({ hash, events, timestamp, blockNumber })
			} catch (e) {
				console.log('[Activity] Failed to parse receipt:', hash, e)
			}
		}

		console.log('[Activity] Final items:', items.length)
		return items
	} catch (e) {
		console.error('[Activity] Fetch error:', e)
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
		const assets = await fetchAssets(params.address as Address.Address)

		const tokenMetadataMap = new Map<
			Address.Address,
			{ decimals: number; symbol: string }
		>()
		for (const asset of assets) {
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
		return { assets, activity }
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

async function refetchBalances(
	accountAddress: string,
): Promise<Map<string, { balance: string; valueUsd: number }>> {
	if (!BALANCES_API_URL) return new Map()
	try {
		const res = await fetch(`${BALANCES_API_URL}balances/${accountAddress}`)
		if (!res.ok) return new Map()
		const balances = (await res.json()) as Array<{
			token: string
			balance: string
			valueUsd: number
		}>
		return new Map(
			balances.map((b) => [
				b.token.toLowerCase(),
				{ balance: b.balance, valueUsd: b.valueUsd },
			]),
		)
	} catch {
		return new Map()
	}
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

	// Assets state - starts from loader, can be refetched without page refresh
	const [assetsData, setAssetsData] = React.useState(initialAssets)
	// Activity state - starts from loader, can be refetched
	const [activity, setActivity] = React.useState(initialActivity)

	// Sync with loader data when address changes
	React.useEffect(() => {
		setAssetsData(initialAssets)
		setActivity(initialActivity)
	}, [initialAssets, initialActivity])

	// Refetch balances without full page refresh
	const refetchAssetsBalances = React.useCallback(async () => {
		const newBalances = await refetchBalances(address)
		if (newBalances.size === 0) return
		setAssetsData((prev) =>
			prev.map((asset) => {
				const newData = newBalances.get(asset.address.toLowerCase())
				if (!newData) return asset
				return {
					...asset,
					balance: newData.balance,
					valueUsd: newData.valueUsd,
				}
			}),
		)
	}, [address])

	// Refetch activity without full page refresh
	const refetchActivity = React.useCallback(async () => {
		const tokenMetadataMap = new Map<
			Address.Address,
			{ decimals: number; symbol: string }
		>()
		for (const asset of assetsData) {
			if (asset.metadata?.decimals !== undefined && asset.metadata?.symbol) {
				tokenMetadataMap.set(asset.address, {
					decimals: asset.metadata.decimals,
					symbol: asset.metadata.symbol,
				})
			}
		}
		const newActivity = await fetchTransactions(
			address as Address.Address,
			tokenMetadataMap,
		)
		setActivity(newActivity)
	}, [address, assetsData])

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

	const dedupedAssets = assetsData.filter(
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

	return (
		<>
			<Layout.Header
				left={
					<Link
						to="/"
						className="glass-pill hover:ring-glass flex items-center gap-1 text-secondary hover:text-primary transition-colors"
					>
						<ArrowLeftIcon className="size-2" />
						<span className="text-sm">{t('common.back')}</span>
					</Link>
				}
				right={null}
			/>

			<div className="pb-3">
				<div className="flex items-center justify-between mb-5">
					<Link to="/" className="flex items-center gap-2 press-down">
						<div className="size-[28px] bg-black dark:bg-white rounded-[3px] flex items-center justify-center">
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
									className="fill-white dark:fill-black"
								/>
							</svg>
						</div>
					</Link>
					<form
						onSubmit={(e) => {
							e.preventDefault()
							const trimmed = searchValue.trim()
							if (trimmed.match(/^0x[a-fA-F0-9]{40}$/)) {
								navigate({ to: '/$address', params: { address: trimmed } })
								setSearchValue('')
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
							onBlur={() => setSearchFocused(false)}
							placeholder={t('common.search')}
							className="bg-transparent outline-none text-[13px] text-primary placeholder:text-secondary w-[100px] focus:w-[180px] transition-all"
						/>
					</form>
					{isOwnProfile ? (
						<button
							type="button"
							onClick={() => {
								disconnect()
								navigate({ to: '/' })
							}}
							className="flex items-center justify-center size-[36px] rounded-full bg-base-alt hover:bg-base-alt/80 active:bg-base-alt/60 transition-colors cursor-pointer"
							title={t('common.logOut')}
						>
							<LogOutIcon className="size-[14px] text-secondary" />
						</button>
					) : (
						<button
							type="button"
							onClick={() => navigate({ to: '/' })}
							className="flex items-center justify-center size-[36px] rounded-full bg-accent hover:bg-accent/90 active:bg-accent/80 transition-colors cursor-pointer"
							title={t('common.signIn')}
						>
							<LogInIcon className="size-[14px] text-white" />
						</button>
					)}
				</div>
				<div className="flex flex-row items-start justify-between gap-4 mb-5">
					<div className="flex-1 min-w-0 flex flex-col gap-2">
						<div className="flex items-baseline gap-2">
							<LottoNumber
								value={formatUsd(totalValue)}
								duration={1200}
								className="text-[32px] sm:text-[40px] md:text-[56px] font-sans font-semibold text-primary -tracking-[0.02em] tabular-nums"
							/>
						</div>
						<div className="flex items-center gap-2 max-w-full">
							<code className="text-[12px] sm:text-[13px] font-mono text-secondary leading-tight min-w-0">
								{address.slice(0, 21)}
								<br />
								{address.slice(21)}
							</code>
							<button
								type="button"
								onClick={() => copy(address)}
								className="flex items-center justify-center size-[28px] rounded-md bg-base-alt hover:bg-base-alt/70 cursor-pointer press-down transition-colors shrink-0"
								title={t('common.copyAddress')}
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
								className="flex items-center justify-center size-[28px] rounded-md bg-base-alt hover:bg-base-alt/70 press-down transition-colors shrink-0"
								title={t('common.viewOnExplorer')}
							>
								<ExternalLinkIcon className="size-[14px] text-tertiary" />
							</a>
						</div>
					</div>
					<QRCode value={address} size={72} className="md:hidden shrink-0" />
					<QRCode
						value={address}
						size={100}
						className="hidden md:block shrink-0"
					/>
				</div>

				<div className="flex flex-col gap-2.5">
					<Section
						title={t('portfolio.assets')}
						subtitle={`${assetsWithBalance.length} ${t('portfolio.assetCount', { count: assetsWithBalance.length })}`}
						defaultOpen
						headerRight={
							<button
								type="button"
								onClick={() => setShowZeroBalances(!showZeroBalances)}
								className="flex items-center justify-center size-[24px] rounded-md bg-base-alt hover:bg-base-alt/70 transition-colors cursor-pointer"
								title={
									showZeroBalances
										? t('portfolio.hideZeroBalances')
										: t('portfolio.showZeroBalances')
								}
							>
								{showZeroBalances ? (
									<EyeOffIcon className="size-[14px] text-tertiary" />
								) : (
									<EyeIcon className="size-[14px] text-tertiary" />
								)}
							</button>
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
							initialToken={initialToken}
						/>
					</Section>

					<Section
						title={t('portfolio.activity')}
						externalLink={`https://explore.mainnet.tempo.xyz/address/${address}`}
						defaultOpen
					>
						<ActivityHeatmap activity={activity} />
						<ActivityList activity={activity} address={address} />
					</Section>

					<SettingsSection assets={assetsData} />
				</div>
			</div>
		</>
	)
}

const springFast = spring({
	mass: 1,
	stiffness: 2600,
	damping: 100,
})

const springSlower = spring({
	mass: 1,
	stiffness: 1200,
	damping: 80,
})

function Section(props: {
	title: string
	subtitle?: string
	externalLink?: string
	defaultOpen?: boolean
	headerRight?: React.ReactNode
	children: React.ReactNode
	backButton?: {
		label: string
		onClick: () => void
	}
}) {
	const {
		title,
		subtitle,
		externalLink,
		defaultOpen = false,
		headerRight,
		children,
		backButton,
	} = props
	const [open, setOpen] = React.useState(defaultOpen)
	const contentRef = React.useRef<HTMLDivElement>(null)
	const wrapperRef = React.useRef<HTMLDivElement>(null)
	const innerRef = React.useRef<HTMLDivElement>(null)
	const animationRef = React.useRef<ReturnType<typeof waapi.animate> | null>(
		null,
	)

	const handleClick = () => {
		const content = contentRef.current
		const wrapper = wrapperRef.current
		const inner = innerRef.current
		if (!content || !wrapper || !inner) return

		// Cancel any running animation
		if (animationRef.current) {
			animationRef.current.cancel()
			animationRef.current = null
		}

		const nextOpen = !open
		setOpen(nextOpen)

		if (nextOpen) {
			const targetHeight = wrapper.getBoundingClientRect().height
			content.style.height = '0px'
			animationRef.current = waapi.animate(content, {
				height: [0, targetHeight],
				ease: springFast,
			})
			waapi.animate(inner, {
				translateY: ['-40%', '0%'],
				opacity: [0, 1],
				ease: springSlower,
			})
			animationRef.current.then(() => {
				requestAnimationFrame(() => {
					content.style.height = 'auto'
				})
				animationRef.current = null
			})
		} else {
			const currentHeight = content.offsetHeight
			content.style.height = `${currentHeight}px`
			animationRef.current = waapi.animate(content, {
				height: [currentHeight, 0],
				ease: springFast,
			})
			waapi.animate(inner, {
				scale: [1, 1],
				opacity: [1, 0],
				ease: springFast,
			})
			animationRef.current.then(() => {
				animationRef.current = null
			})
		}
	}

	return (
		<div className="rounded-xl border border-card-border bg-card-header">
			<div className="flex items-center h-[44px] pl-2 pr-2.5">
				<button
					type="button"
					onClick={handleClick}
					className={cx(
						'flex flex-1 items-center justify-between cursor-pointer select-none press-down transition-colors',
						'text-[14px] font-medium text-primary hover:text-accent',
						'rounded-xl! focus-visible:outline-2! focus-visible:outline-accent! focus-visible:outline-offset-0!',
					)}
				>
					<span className="flex items-center gap-2">
						{backButton ? (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation()
									backButton.onClick()
								}}
								className="flex items-center gap-1.5 text-accent hover:text-accent/80 transition-colors cursor-pointer"
							>
								<ArrowLeftIcon className="size-[14px]" />
								<span>{backButton.label}</span>
							</button>
						) : (
							<>
								{title}
								{subtitle && (
									<>
										<span className="w-px h-4 bg-card-border" />
										<span className="text-[12px] text-tertiary font-normal">
											{subtitle}
										</span>
									</>
								)}
							</>
						)}
					</span>
				</button>
				<span className="flex items-center gap-1.5">
					{headerRight}
					{externalLink && (
						<a
							href={externalLink}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center justify-center size-[24px] rounded-md bg-base-alt hover:bg-base-alt/70 transition-colors"
							onClick={(e) => e.stopPropagation()}
						>
							<GlobeIcon className="size-[14px] text-tertiary" />
						</a>
					)}
					<button
						type="button"
						onClick={handleClick}
						className="flex items-center justify-center size-[24px] rounded-md bg-base-alt hover:bg-base-alt/70 transition-colors cursor-pointer"
					>
						{open ? (
							<MinusIcon className="size-[14px] text-tertiary" />
						) : (
							<PlusIcon className="size-[14px] text-tertiary" />
						)}
					</button>
				</span>
			</div>
			<div
				ref={contentRef}
				className="overflow-hidden rounded-b-xl"
				style={{ height: open ? 'auto' : 0 }}
				inert={!open ? true : undefined}
			>
				<div
					ref={wrapperRef}
					className="bg-card border-t border-card-border px-2 rounded-b-xl overflow-hidden"
				>
					<div ref={innerRef} className="origin-top">
						{children}
					</div>
				</div>
			</div>
		</div>
	)
}

function QRCode({
	value,
	size = 100,
	className,
}: {
	value: string
	size?: number
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

	return (
		<svg
			ref={svgRef}
			role="img"
			aria-label="QR Code - Click to copy address"
			className={cx(
				'rounded-lg bg-surface p-1.5 cursor-pointer outline-none border border-base-border hover:border-accent/50 transition-colors',
				className,
			)}
			width={size}
			height={size}
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

function ActivityHeatmap({ activity }: { activity: ActivityItem[] }) {
	const weeks = 52
	const days = 7

	const activityByDay = React.useMemo(() => {
		const counts = new Map<string, number>()

		for (let i = 0; i < activity.length; i++) {
			const item = activity[i]
			// Only count transactions with actual timestamps
			if (!item.timestamp) continue
			const date = new Date(item.timestamp).toISOString().split('T')[0]
			counts.set(date, (counts.get(date) ?? 0) + 1)
		}
		return counts
	}, [activity])

	const grid = React.useMemo(() => {
		const data: { level: number; count: number; date: string }[][] = []
		const now = new Date()
		const startDate = new Date(now)
		// Start from (weeks * 7 - 1) days ago so we end on today
		startDate.setDate(startDate.getDate() - (weeks * 7 - 1))

		const maxCount = Math.max(1, ...activityByDay.values())

		for (let w = 0; w < weeks; w++) {
			const week: { level: number; count: number; date: string }[] = []
			for (let d = 0; d < days; d++) {
				const date = new Date(startDate)
				date.setDate(startDate.getDate() + w * 7 + d)
				const key = date.toISOString().split('T')[0]
				const count = activityByDay.get(key) ?? 0
				const level =
					count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4))
				week.push({ level, count, date: key })
			}
			data.push(week)
		}
		return data
	}, [activityByDay])

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

	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr)
		return date.toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
		})
	}

	const [hoveredCell, setHoveredCell] = React.useState<{
		count: number
		date: string
		x: number
		y: number
	} | null>(null)

	return (
		<div className="relative">
			<div className="flex gap-[3px] w-full py-2">
				{grid.map((week, wi) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: grid is static and doesn't reorder
					<div key={`w-${wi}`} className="flex flex-col gap-[3px] flex-1">
						{week.map((cell, di) => (
							// biome-ignore lint/a11y/noStaticElementInteractions: hover tooltip only
							<div
								key={cell.date || `d-${wi}-${di}`}
								className={cx(
									'w-full aspect-square rounded-[2px] cursor-default transition-transform hover:scale-125 hover:z-10',
									getColor(cell.level),
								)}
								onMouseEnter={(e) => {
									const rect = e.currentTarget.getBoundingClientRect()
									setHoveredCell({
										count: cell.count,
										date: cell.date,
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
			{hoveredCell && (
				<div
					className="fixed z-[100] px-2 py-1 text-[11px] text-white bg-gray-900 rounded-md shadow-lg whitespace-nowrap pointer-events-none border border-gray-700"
					style={{
						left: hoveredCell.x,
						top: hoveredCell.y - 6,
						transform: 'translate(-50%, -100%)',
					}}
				>
					<span className="font-medium">{hoveredCell.count}</span> transaction
					{hoveredCell.count !== 1 ? 's' : ''} on{' '}
					<span className="text-gray-300">{formatDate(hoveredCell.date)}</span>
				</div>
			)}
		</div>
	)
}

function _BlockTimeline({
	activity,
	currentBlock,
	selectedBlock,
	onSelectBlock,
	isPaused,
	onPauseChange,
}: {
	activity: ActivityItem[]
	currentBlock: bigint | null
	selectedBlock: bigint | undefined
	onSelectBlock: (block: bigint | undefined) => void
	isPaused: boolean
	onPauseChange: (paused: boolean) => void
}) {
	const scrollRef = React.useRef<HTMLDivElement>(null)
	const [isUserScrolling, setIsUserScrolling] = React.useState(false)
	const scrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>()

	const userBlockNumbers = React.useMemo(() => {
		const blocks = new Set<bigint>()
		for (const item of activity) {
			if (item.blockNumber !== undefined) {
				blocks.add(item.blockNumber)
			}
		}
		return blocks
	}, [activity])

	const blocksToShow = 80
	const emptyBlocksOnRight = 10

	const blocks = React.useMemo(() => {
		if (!currentBlock) return []
		const result: {
			blockNumber: bigint
			hasActivity: boolean
			isEmpty: boolean
		}[] = []

		for (let i = blocksToShow - 1; i >= 0; i--) {
			const blockNum = currentBlock - BigInt(i)
			if (blockNum > 0n) {
				result.push({
					blockNumber: blockNum,
					hasActivity: userBlockNumbers.has(blockNum),
					isEmpty: false,
				})
			}
		}

		for (let i = 1; i <= emptyBlocksOnRight; i++) {
			result.push({
				blockNumber: currentBlock + BigInt(i),
				hasActivity: false,
				isEmpty: true,
			})
		}

		return result
	}, [currentBlock, userBlockNumbers])

	React.useEffect(() => {
		if (!scrollRef.current || isUserScrolling || isPaused) return
		const container = scrollRef.current
		const currentBlockIndex = blocksToShow - 1
		const blockWidth = 10
		const gap = 3
		const scrollPosition =
			currentBlockIndex * (blockWidth + gap) -
			container.clientWidth / 2 +
			blockWidth / 2
		container.scrollTo({ left: scrollPosition, behavior: 'smooth' })
	}, [isUserScrolling, isPaused])

	const handleScroll = React.useCallback(() => {
		setIsUserScrolling(true)
		onPauseChange(true)

		if (scrollTimeoutRef.current) {
			clearTimeout(scrollTimeoutRef.current)
		}
		scrollTimeoutRef.current = setTimeout(() => {
			setIsUserScrolling(false)
		}, 2000)
	}, [onPauseChange])

	const handleWheel = React.useCallback((e: React.WheelEvent) => {
		if (scrollRef.current && e.deltaY !== 0) {
			e.preventDefault()
			scrollRef.current.scrollLeft += e.deltaY
		}
	}, [])

	const handleBlockClick = (blockNumber: bigint, isEmpty: boolean) => {
		if (isEmpty) return
		if (selectedBlock === blockNumber) {
			onSelectBlock(undefined)
		} else {
			onSelectBlock(blockNumber)
		}
	}

	const getBlockColor = (
		hasActivity: boolean,
		isEmpty: boolean,
		isSelected: boolean,
	) => {
		if (isEmpty) return 'bg-base-alt/20'
		if (isSelected) return 'bg-accent'
		if (hasActivity) return 'bg-green-500 dark:bg-green-500'
		return 'bg-base-alt/40'
	}

	return (
		<div className="relative py-2">
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				onWheel={handleWheel}
				className="flex gap-[3px] overflow-x-auto scrollbar-hide"
				style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
			>
				{blocks.map((block) => {
					const isSelected = selectedBlock === block.blockNumber
					const isCurrent = block.blockNumber === currentBlock
					return (
						<button
							key={block.blockNumber.toString()}
							type="button"
							onClick={() => handleBlockClick(block.blockNumber, block.isEmpty)}
							disabled={block.isEmpty}
							className={cx(
								'shrink-0 rounded-[2px] transition-all',
								getBlockColor(block.hasActivity, block.isEmpty, isSelected),
								block.hasActivity && !isSelected && 'scale-110',
								isSelected && 'scale-125 z-10 ring-1 ring-accent/50',
								isCurrent && !block.isEmpty && 'ring-1 ring-white/30',
								!block.isEmpty && 'hover:scale-125 hover:z-10 cursor-pointer',
								block.isEmpty && 'cursor-default opacity-50',
							)}
							style={{ width: 10, height: 10 }}
							title={
								block.isEmpty
									? undefined
									: `Block ${block.blockNumber.toString()}`
							}
						/>
					)
				})}
			</div>
			<div className="flex items-center justify-between mt-2">
				<div className="text-[10px] text-tertiary font-mono">
					{currentBlock ? `Block ${currentBlock.toString()}` : 'Loading...'}
				</div>
				{isPaused && (
					<button
						type="button"
						onClick={() => onPauseChange(false)}
						className="text-[10px] text-accent hover:text-accent/80 cursor-pointer"
					>
						Resume
					</button>
				)}
				{selectedBlock !== undefined && (
					<button
						type="button"
						onClick={() => onSelectBlock(undefined)}
						className="text-[10px] text-secondary hover:text-primary cursor-pointer"
					>
						Clear filter
					</button>
				)}
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
	initialToken,
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
	initialToken?: string
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [sendingToken, setSendingToken] = React.useState<string | null>(
		initialToken ?? null,
	)
	const [toastMessage, setToastMessage] = React.useState<string | null>(null)

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
							setSendingToken(
								sendingToken === asset.address ? null : asset.address,
							)
						}}
						onSendComplete={(symbol) => {
							setToastMessage(`Sent ${symbol} successfully`)
							onOptimisticClear?.(asset.address)
							onSendSuccess?.()
							// Delay collapsing form to show success state
							setTimeout(() => setSendingToken(null), 1500)
						}}
						onSendError={() => {
							onOptimisticClear?.(asset.address)
						}}
						onOptimisticSend={onOptimisticSend}
						onFaucetSuccess={onFaucetSuccess}
						isOwnProfile={isOwnProfile}
						initialRecipient={
							asset.address === initialToken ? initialSendTo : undefined
						}
					/>
				))}
			</div>
			{toastMessage &&
				createPortal(
					<div className="fixed bottom-4 right-4 z-50 bg-surface rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.12)] overflow-hidden flex">
						<div className="w-1 bg-positive shrink-0" />
						<div className="flex items-center gap-1.5 px-3 py-2">
							<CheckIcon className="size-[14px] text-positive" />
							<span className="text-[13px] text-primary font-medium">
								{toastMessage}
							</span>
						</div>
					</div>,
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
}) {
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
	const recipientInputRef = React.useRef<HTMLInputElement>(null)
	const amountInputRef = React.useRef<HTMLInputElement>(null)

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
			setSendError(shortMessage || 'Transaction failed')
			// Revert optimistic update on error
			onSendError?.()
			setTimeout(() => {
				setSendState('idle')
				setSendError(null)
				resetWrite()
			}, 3000)
		}
	}, [writeError, resetWrite, onSendError])

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
			setTimeout(() => setFaucetState('idle'), 1500)
		}
	}, [asset.balance, faucetState, faucetInitialBalance])

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

	const handleSend = () => {
		if (!isValidSend || parsedAmount === 0n) return
		// Store pending amount - optimistic update will apply after wallet signature
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
				className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 sm:py-0 rounded-xl hover:glass-thin transition-all sm:h-[52px]"
			>
				<div className="flex items-center gap-1.5 flex-1 min-w-0">
					<TokenIcon address={asset.address} className="size-[24px] shrink-0" />
					<input
						ref={recipientInputRef}
						type="text"
						value={recipient}
						onChange={(e) => setRecipient(e.target.value)}
						placeholder="0x..."
						className="flex-1 min-w-0 h-[32px] px-2 rounded-lg border border-card-border bg-base text-[12px] text-primary font-mono text-left placeholder:text-tertiary focus:outline-none focus:border-accent"
					/>
				</div>
				<div className="flex items-center gap-1">
					<input
						ref={amountInputRef}
						type="text"
						inputMode="decimal"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0.00"
						className="w-[7ch] h-[32px] px-2 rounded-lg border border-card-border bg-base text-[12px] text-primary font-mono text-right placeholder:text-tertiary focus:outline-none focus:border-accent"
					/>
					<button
						type="button"
						onClick={handleMax}
						className="h-[32px] px-2 rounded-lg border border-card-border bg-base text-[10px] font-medium text-accent hover:bg-base-alt cursor-pointer transition-colors"
					>
						MAX
					</button>
					<button
						type="submit"
						className={cx(
							'size-[32px] rounded-lg press-down transition-colors flex items-center justify-center shrink-0',
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
					<button
						type="button"
						onClick={handleToggle}
						className="size-[32px] flex items-center justify-center cursor-pointer text-tertiary hover:text-primary hover:bg-base-alt rounded-lg transition-colors shrink-0"
						title="Cancel"
					>
						<XIcon className="size-[14px]" />
					</button>
				</div>
				{sendError && (
					<div className="col-span-full pl-9 sm:pl-0 text-[11px] text-negative truncate">
						{sendError}
					</div>
				)}
			</form>
		)
	}

	return (
		<div
			className="group grid grid-cols-[1fr_auto_60px_auto] md:grid-cols-[1fr_auto_60px_90px_auto] gap-1 rounded-xl hover:glass-thin transition-all"
			style={{ height: ROW_HEIGHT }}
		>
			<span className="px-2 text-primary flex items-center gap-2">
				<TokenIcon
					address={asset.address}
					className="size-[28px] transition-transform group-hover:scale-105"
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
							<span className="text-tertiary">…</span>
						)}
					</span>
				</span>
				{faucetState === 'loading' && (
					<span className="absolute inset-0 flex items-center justify-end pr-2">
						<BouncingDots />
					</span>
				)}
			</span>
			<span className="pl-1 flex items-center justify-start">
				<span className="text-[9px] font-medium text-tertiary bg-base-alt px-1 py-0.5 rounded font-mono whitespace-nowrap">
					{asset.metadata?.symbol || shortenAddress(asset.address, 3)}
				</span>
			</span>
			<span className="px-2 text-secondary hidden md:flex items-center justify-end">
				<span className="font-sans tabular-nums whitespace-nowrap">
					{asset.valueUsd !== undefined ? (
						formatUsdCompact(asset.valueUsd)
					) : (
						<span className="text-tertiary">…</span>
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
							'flex items-center justify-center size-[24px] rounded-md transition-colors',
							isFaucetToken
								? 'hover:bg-accent/10 cursor-pointer'
								: 'opacity-0 pointer-events-none',
						)}
						title={isFaucetToken ? 'Request tokens' : undefined}
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
					className="flex items-center justify-center size-[28px] rounded-md hover:bg-accent/10 cursor-pointer transition-all opacity-60 group-hover:opacity-100"
					title="Send"
				>
					<SendIcon className="size-[14px] text-tertiary hover:text-accent transition-colors" />
				</button>
			</span>
		</div>
	)
}

const ACTIVITY_PAGE_SIZE = 10

function ActivityList({
	activity,
	address,
}: {
	activity: ActivityItem[]
	address: string
}) {
	const viewer = address as Address.Address
	const { t } = useTranslation()
	const [page, setPage] = React.useState(0)

	if (activity.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-6 gap-2">
				<div className="size-10 rounded-full bg-base-alt flex items-center justify-center">
					<ReceiptIcon className="size-5 text-tertiary" />
				</div>
				<p className="text-[13px] text-secondary">
					{t('portfolio.noActivityYet')}
				</p>
			</div>
		)
	}

	const totalPages = Math.ceil(activity.length / ACTIVITY_PAGE_SIZE)
	const paginatedActivity = activity.slice(
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
				/>
			))}
			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-1 pt-3 pb-1">
					{Array.from({ length: totalPages }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: pagination buttons are static
						<button
							key={`page-${i}`}
							type="button"
							onClick={() => setPage(i)}
							className={cx(
								'size-[28px] rounded-full text-[12px] cursor-pointer transition-all',
								page === i
									? 'bg-accent text-white'
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
}: {
	item: ActivityItem
	viewer: Address.Address
	transformEvent: (event: KnownEvent) => KnownEvent
}) {
	const { t } = useTranslation()
	const [showModal, setShowModal] = React.useState(false)

	return (
		<>
			<div className="group flex items-center gap-2 px-3 h-[48px] rounded-xl hover:glass-thin transition-all">
				<TxDescription.ExpandGroup
					events={item.events}
					seenAs={viewer}
					transformEvent={transformEvent}
					limitFilter={preferredEventsFilter}
					emptyContent={t('common.transaction')}
				/>
				<a
					href={`https://explore.mainnet.tempo.xyz/tx/${item.hash}`}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center justify-center size-[24px] rounded-md hover:bg-base-alt shrink-0 transition-all opacity-60 group-hover:opacity-100"
					title={t('common.viewOnExplorer')}
				>
					<ExternalLinkIcon className="size-[14px] text-tertiary hover:text-accent transition-colors" />
				</a>
				<button
					type="button"
					onClick={() => setShowModal(true)}
					className="flex items-center justify-center size-[24px] rounded-md hover:bg-base-alt shrink-0 cursor-pointer transition-all opacity-60 group-hover:opacity-100"
					title={t('common.viewReceipt')}
				>
					<ReceiptIcon className="size-[14px] text-tertiary hover:text-accent transition-colors" />
				</button>
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
	const contentRef = React.useRef<HTMLDivElement>(null)

	const handleClose = React.useCallback(() => {
		setIsVisible(false)
		setTimeout(onClose, 200)
	}, [onClose])

	React.useEffect(() => {
		requestAnimationFrame(() => setIsVisible(true))
	}, [])

	React.useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') handleClose()
		}
		document.addEventListener('keydown', handleEscape)
		return () => document.removeEventListener('keydown', handleEscape)
	}, [handleClose])

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
				'fixed inset-0 left-[calc(45vw+8px)] max-lg:left-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-md transition-opacity duration-200',
				isVisible ? 'opacity-100' : 'opacity-0',
			)}
			onClick={handleClose}
			onKeyDown={(e) => {
				if (e.key === 'Escape') handleClose()
			}}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: stops click propagation */}
			<div
				ref={contentRef}
				role="presentation"
				className={cx(
					'flex flex-col items-center transition-all duration-200',
					isVisible
						? 'opacity-100 scale-100 translate-y-0'
						: 'opacity-0 scale-95 translate-y-4',
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div
					data-receipt
					className="flex flex-col w-[360px] liquid-glass-premium border-b-0 rounded-[16px] rounded-br-none rounded-bl-none text-base-content"
				>
					<div className="flex gap-[40px] px-[20px] pt-[24px] pb-[16px]">
						<div className="shrink-0">
							<ReceiptMark />
						</div>
						<div className="flex flex-col gap-[8px] font-mono text-[13px] leading-[16px] flex-1">
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
							<div className="flex flex-col gap-3 px-[20px] py-[16px] font-mono text-[13px] leading-4 [counter-reset:event]">
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

				<div className="w-[360px]">
					<a
						href={`https://explore.mainnet.tempo.xyz/tx/${hash}`}
						target="_blank"
						rel="noopener noreferrer"
						className="press-down text-[13px] font-sans px-[12px] py-[12px] flex items-center justify-center gap-[8px] liquid-glass-premium rounded-bl-[16px] rounded-br-[16px] text-tertiary hover:text-primary border-t border-base-border"
					>
						<span>{t('common.viewTransaction')}</span>
						<span aria-hidden="true">→</span>
					</a>
				</div>
			</div>
		</div>
	)
}
