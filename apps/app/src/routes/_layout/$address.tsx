import {
	Link,
	createFileRoute,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { waapi, spring } from 'animejs'
import { Address } from 'ox'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { encode } from 'uqr'
import {
	createClient,
	createPublicClient,
	encodeFunctionData,
	erc20Abi,
	formatUnits,
	http,
	parseUnits,
} from 'viem'
import { sendTransaction } from 'viem/actions'
import { WebCryptoP256, PublicKey } from 'ox'
import { Account as TempoAccount, Abis } from 'viem/tempo'
import { getLogs } from 'viem/actions'
import { getTempoChain } from '#wagmi.config'

const ACCOUNT_KEYCHAIN_ADDRESS =
	'0xaAAAaaAA00000000000000000000000000000000' as const
import {
	useAccount,
	useConnectorClient,
	useDisconnect,
	useWriteContract,
	useWaitForTransactionReceipt,
} from 'wagmi'
import { Hooks } from 'wagmi/tempo'
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
import KeyIcon from '~icons/lucide/key-round'
import RefreshCwIcon from '~icons/lucide/refresh-cw'
import { AccessKeysSection } from '#comps/AccessKeysSection'
import { useTranslation } from 'react-i18next'
import i18n from '#lib/i18n'

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

type SignatureType = 'secp256k1' | 'p256' | 'webauthn'

type AccessKey = {
	keyId: string
	signatureType: SignatureType
	expiry: number // Unix timestamp, 0 = never expires
	enforceLimits: boolean
	isRevoked: boolean
	spendingLimits: Map<string, bigint> // token address -> remaining limit
	createdAt: number
}

type AccessKeyForToken = AccessKey & {
	spendingLimit: bigint | undefined // remaining limit for specific token
	originalLimit: bigint | undefined // original limit from creation event
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

		return tokens.map((token) => ({
			address: token.address as Address.Address,
			metadata: {
				name: token.name,
				symbol: token.symbol,
				decimals: token.decimals,
				priceUsd: 1,
			},
			balance: '0',
			valueUsd: 0,
		}))
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

const fetchTransactionsFromExplorer = createServerFn({ method: 'GET' })
	.inputValidator((data: { address: string }) => data)
	.handler(async ({ data }) => {
		const { address } = data
		const explorerUrl =
			TEMPO_ENV === 'presto'
				? 'https://explore.presto.tempo.xyz'
				: 'https://explore.mainnet.tempo.xyz'

		// Use cloudflare:workers env for Cloudflare Workers runtime
		const { env } = await import('cloudflare:workers')
		const auth = env.PRESTO_RPC_AUTH as string | undefined
		const headers: Record<string, string> = {}
		if (auth) {
			headers.Authorization = `Basic ${btoa(auth)}`
		}

		try {
			// Use explorer's internal API which includes Mint/Burn events
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
		console.log('[Activity] Fetching transactions for', address)
		const result = await fetchTransactionsFromExplorer({ data: { address } })
		console.log('[Activity] Result:', result.transactions?.length, 'txs')

		if (result.error || result.transactions.length === 0) {
			return []
		}

		const txData = result.transactions.slice(0, 10) as Array<{
			hash: string
			timestamp?: string
		}>
		const hashes = txData.map((tx) => tx.hash)

		const receiptsResult = await fetchTransactionReceipts({ data: { hashes } })

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
				items.push({ hash, events, timestamp })
			} catch {
				// Skip failed parsing
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

function AddressView() {
	const { address } = Route.useParams()
	const { assets: assetsData, activity } = Route.useLoaderData()
	const { copy, notifying } = useCopy()
	const [showZeroBalances, setShowZeroBalances] = React.useState(false)
	const { setSummary } = useActivitySummary()
	const { disconnect } = useDisconnect()
	const navigate = useNavigate()
	const router = useRouter()
	const [searchValue, setSearchValue] = React.useState('')
	const [searchFocused, setSearchFocused] = React.useState(false)
	const [mounted, setMounted] = React.useState(false)
	const [isRefreshing, setIsRefreshing] = React.useState(false)
	const account = useAccount()
	const { sendTo, token: initialToken } = Route.useSearch()
	const { t } = useTranslation()

	React.useEffect(() => {
		setMounted(true)
	}, [])

	React.useEffect(() => {
		if (isRefreshing && !router.state.isLoading) {
			setIsRefreshing(false)
		}
	}, [isRefreshing, router.state.isLoading])

	const isOwnProfile =
		mounted && account.address?.toLowerCase() === address.toLowerCase()

	const handleRefresh = React.useCallback(() => {
		setIsRefreshing(true)
		router.invalidate()
	}, [router])

	const handleFaucetSuccess = React.useCallback(() => {
		router.invalidate()
	}, [router])

	React.useEffect(() => {
		if (activity.length > 0) {
			const types = [
				...new Set(
					activity.flatMap((item) =>
						item.events.map((e) => eventTypeToActivityType(e.type)),
					),
				),
			]
			setSummary({
				types,
				count: activity.length,
				recentTimestamp: Date.now(),
			})
		} else {
			setSummary(null)
		}
		return () => setSummary(null)
	}, [activity, setSummary])

	const totalValue = assetsData.reduce(
		(sum, asset) => sum + (asset.valueUsd ?? 0),
		0,
	)
	const dedupedAssets = assetsData.filter(
		(a, i, arr) => arr.findIndex((b) => b.address === a.address) === i,
	)
	const assetsWithBalance = dedupedAssets.filter(
		(a) =>
			(a.balance && a.balance !== '0') ||
			FAUCET_TOKEN_ADDRESSES.has(a.address.toLowerCase()),
	)
	const displayedAssets = showZeroBalances ? dedupedAssets : assetsWithBalance

	return (
		<>
			<Layout.Header
				left={
					<Link
						to="/"
						className="glass-pill hover:ring-glass hidden lg:flex items-center gap-1 text-secondary hover:text-primary transition-colors"
					>
						<ArrowLeftIcon className="size-2" />
						<span className="text-sm">Back</span>
					</Link>
				}
				right={null}
			/>

			<div className="pb-3">
				<div className="flex items-center justify-between mb-5">
					<Link to="/" className="flex items-center gap-2 press-down">
						<div className="size-[28px] bg-black dark:bg-white rounded-[3px] flex items-center justify-center">
							<svg width="22" height="22" viewBox="0 0 269 269" fill="none">
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
							placeholder="Search"
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
							title="Log out"
						>
							<LogOutIcon className="size-[14px] text-secondary" />
						</button>
					) : (
						<button
							type="button"
							onClick={() => navigate({ to: '/' })}
							className="flex items-center justify-center size-[36px] rounded-full bg-accent hover:bg-accent/90 active:bg-accent/80 transition-colors cursor-pointer"
							title="Sign in"
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
								title="Copy address"
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
								title="View on Explorer"
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
						headerRight={
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation()
									handleRefresh()
								}}
								disabled={isRefreshing}
								className="flex items-center justify-center size-[24px] rounded-md bg-base-alt hover:bg-base-alt/70 transition-colors cursor-pointer disabled:cursor-default"
								title="Refresh activity"
							>
								<RefreshCwIcon
									className={cx(
										'size-[14px] text-tertiary',
										isRefreshing && 'animate-spin',
									)}
								/>
							</button>
						}
					>
						<ActivityHeatmap activity={activity} />
						<ActivityList activity={activity} address={address} />
					</Section>

					<SettingsSection assets={assetsData} accountAddress={address} />

					<AccessKeysSection assets={assetsData} accountAddress={address} />
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
			{cells.map(({ x, y }) => {
				let opacity = 1
				if (mousePos && !notifying) {
					const cellCenterX = x * cellSize + cellSize / 2
					const cellCenterY = y * cellSize + cellSize / 2
					const distance = Math.sqrt(
						(cellCenterX - mousePos.x) ** 2 + (cellCenterY - mousePos.y) ** 2,
					)
					const maxFadeRadius = 25
					opacity = Math.min(1, distance / maxFadeRadius)
					opacity = 0.15 + opacity * 0.85
				}
				return (
					<rect
						key={`${x}-${y}`}
						x={x * cellSize}
						y={y * cellSize}
						width={cellSize}
						height={cellSize}
						fill={notifying ? '#22c55e' : 'currentColor'}
						className="text-secondary"
						style={{
							opacity: opacity * 0.85,
							transition: 'fill 0.2s ease-out, opacity 0.1s ease-out',
						}}
					/>
				)
			})}
		</svg>
	)
}

function SettingsSection({
	assets,
	accountAddress,
}: {
	assets: AssetData[]
	accountAddress: string
}) {
	const { t } = useTranslation()
	const assetsWithBalance = assets.filter((a) => a.balance && a.balance !== '0')

	// Fetch user's fee token preference from the blockchain
	const userFeeToken = Hooks.fee.useUserToken({
		account: accountAddress as `0x${string}`,
	})

	// Mutation to set the user's fee token preference
	const setUserFeeToken = Hooks.fee.useSetUserTokenSync()

	// Use the on-chain fee token, or fall back to first asset with balance
	const currentFeeToken =
		userFeeToken.data ?? assetsWithBalance[0]?.address ?? ''

	const handleFeeTokenChange = React.useCallback(
		(address: string) => {
			setUserFeeToken.mutate({ token: address as `0x${string}` })
		},
		[setUserFeeToken],
	)

	const [currentLanguage, setCurrentLanguage] = React.useState(() => {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('tempo-language')
			if (saved) {
				i18n.changeLanguage(saved)
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
			title="Settings"
			backButton={
				submenuTitle ? { label: submenuTitle, onClick: handleBack } : undefined
			}
		>
			<Settings
				assets={assets}
				currentFeeToken={currentFeeToken}
				onFeeTokenChange={handleFeeTokenChange}
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

function formatBigIntAmount(value: bigint, decimals: number): string {
	const formatted = formatUnits(value, decimals)
	const num = Number(formatted)
	if (num < 0.01 && num > 0) return '<0.01'
	return num.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
}

function formatExpiry(expiry: number): string {
	if (expiry === 0) return 'Never'
	const now = Date.now()
	const diff = expiry - now
	if (diff <= 0) return 'Expired'
	const days = Math.floor(diff / (24 * 60 * 60 * 1000))
	if (days > 0) return `${days}d`
	const hours = Math.floor(diff / (60 * 60 * 1000))
	if (hours > 0) return `${hours}h`
	const minutes = Math.floor(diff / (60 * 1000))
	return `${minutes}m`
}

function _getSignatureTypeLabel(type: SignatureType): string {
	switch (type) {
		case 'secp256k1':
			return 'ECDSA'
		case 'p256':
			return 'P-256'
		case 'webauthn':
			return 'WebAuthn'
		default:
			return type
	}
}

// On-chain access key data from KeyAuthorized events
type OnChainAccessKey = {
	keyId: string
	signatureType: number
	expiry: number // Unix timestamp in seconds
	blockNumber: bigint
	enforceLimits: boolean
	spendingLimits: Map<string, bigint> // token address -> remaining limit
	originalLimits: Map<string, bigint> // token address -> original limit (from events)
}

function _AccessKeysSection_OLD({
	assets,
	accountAddress,
}: {
	assets: AssetData[]
	accountAddress: string
}) {
	const [showCreate, setShowCreate] = React.useState(false)
	const [createToken, setCreateToken] = React.useState<Address.Address | null>(
		null,
	)

	// On-chain access keys fetched from KeyAuthorized events
	const [onChainKeys, setOnChainKeys] = React.useState<OnChainAccessKey[]>([])
	const [isLoadingKeys, setIsLoadingKeys] = React.useState(true)
	const [_refetchCounter, setRefetchCounter] = React.useState(0)

	// Pending keys that are optimistically shown while waiting for on-chain confirmation
	const [pendingKeys, setPendingKeys] = React.useState<
		Array<{
			keyId: string
			expiry: number
			tokenAddress?: string
			spendingLimit?: bigint
		}>
	>([])

	// Keys that are being revoked (optimistically hidden)
	const [revokingKeyIds, setRevokingKeyIds] = React.useState<Set<string>>(
		new Set(),
	)

	// Use a ref for assets so we can access latest value without triggering re-fetches
	const assetsRef = React.useRef(assets)
	React.useEffect(() => {
		assetsRef.current = assets
	}, [assets])

	// Checksum the account address for proper event filtering (memoized to prevent re-renders)
	const checksummedAddress = React.useMemo(
		() => Address.checksum(accountAddress as Address.Address),
		[accountAddress],
	)

	// Fetch on-chain access keys from KeyAuthorized/KeyRevoked events
	React.useEffect(() => {
		if (typeof window === 'undefined') return
		let cancelled = false

		const fetchOnChainKeys = async () => {
			setIsLoadingKeys(true)
			try {
				const chain = getTempoChain()
				const client = createPublicClient({
					chain,
					transport: http(),
				})

				// Get the current block number to calculate a reasonable range
				// RPC has a max block range of 100,000
				const blockNumber = await client.getBlockNumber()
				const fromBlock = blockNumber > 99000n ? blockNumber - 99000n : 0n

				// Fetch KeyAuthorized events for this account
				const authorizedLogs = await getLogs(client, {
					address: ACCOUNT_KEYCHAIN_ADDRESS,
					event: {
						type: 'event',
						name: 'KeyAuthorized',
						inputs: [
							{ type: 'address', name: 'account', indexed: true },
							{ type: 'address', name: 'publicKey', indexed: true },
							{ type: 'uint8', name: 'signatureType' },
							{ type: 'uint64', name: 'expiry' },
						],
					},
					args: {
						account: checksummedAddress,
					},
					fromBlock,
					toBlock: 'latest',
				})

				// Fetch KeyRevoked events for this account
				const revokedLogs = await getLogs(client, {
					address: ACCOUNT_KEYCHAIN_ADDRESS,
					event: {
						type: 'event',
						name: 'KeyRevoked',
						inputs: [
							{ type: 'address', name: 'account', indexed: true },
							{ type: 'address', name: 'publicKey', indexed: true },
						],
					},
					args: {
						account: checksummedAddress,
					},
					fromBlock,
					toBlock: 'latest',
				})

				// Fetch SpendingLimitUpdated events to get original limits
				const spendingLimitLogs = await getLogs(client, {
					address: ACCOUNT_KEYCHAIN_ADDRESS,
					event: {
						type: 'event',
						name: 'SpendingLimitUpdated',
						inputs: [
							{ type: 'address', name: 'account', indexed: true },
							{ type: 'address', name: 'publicKey', indexed: true },
							{ type: 'address', name: 'token', indexed: true },
							{ type: 'uint256', name: 'newLimit' },
						],
					},
					args: {
						account: checksummedAddress,
					},
					fromBlock,
					toBlock: 'latest',
				})

				// Build map of original limits per key per token (first event = original limit)
				const originalLimits = new Map<string, Map<string, bigint>>()
				for (const log of spendingLimitLogs) {
					if (log.args.publicKey && log.args.token && log.args.newLimit) {
						const keyIdLower = (log.args.publicKey as string).toLowerCase()
						const tokenLower = (log.args.token as string).toLowerCase()
						let keyLimits = originalLimits.get(keyIdLower)
						if (!keyLimits) {
							keyLimits = new Map()
							originalLimits.set(keyIdLower, keyLimits)
						}
						// Only set if not already set (first event = original)
						if (!keyLimits.has(tokenLower)) {
							keyLimits.set(tokenLower, log.args.newLimit as bigint)
						}
					}
				}

				// Build set of revoked key IDs
				const revokedKeyIds = new Set<string>()
				for (const log of revokedLogs) {
					if (log.args.publicKey) {
						revokedKeyIds.add(log.args.publicKey.toLowerCase())
					}
				}

				// Build list of authorized keys (excluding revoked ones)
				const basicKeys = authorizedLogs
					.filter(
						(log) =>
							log.args.publicKey &&
							!revokedKeyIds.has(log.args.publicKey.toLowerCase()),
					)
					.map((log) => ({
						keyId: log.args.publicKey as string,
						signatureType: Number(log.args.signatureType ?? 0),
						expiry: Number(log.args.expiry ?? 0),
						blockNumber: log.blockNumber,
					}))
					// Filter out expired keys
					.filter(
						(k) => k.expiry === 0 || k.expiry > Math.floor(Date.now() / 1000),
					)

				// Fetch key details and spending limits for each key
				const keys: OnChainAccessKey[] = await Promise.all(
					basicKeys.map(async (k) => {
						try {
							// Get key details including enforceLimits
							const keyData = (await client.readContract({
								address: ACCOUNT_KEYCHAIN_ADDRESS,
								abi: [
									{
										name: 'getKey',
										type: 'function',
										stateMutability: 'view',
										inputs: [
											{ type: 'address', name: 'account' },
											{ type: 'address', name: 'keyId' },
										],
										outputs: [
											{
												type: 'tuple',
												components: [
													{ type: 'uint8', name: 'signatureType' },
													{ type: 'address', name: 'keyId' },
													{ type: 'uint64', name: 'expiry' },
													{ type: 'bool', name: 'enforceLimits' },
													{ type: 'bool', name: 'isRevoked' },
												],
											},
										],
									},
								],
								functionName: 'getKey',
								args: [checksummedAddress, k.keyId as `0x${string}`],
							})) as { enforceLimits: boolean }

							// Fetch spending limits for all assets with balance
							const spendingLimits = new Map<string, bigint>()
							const assetsToCheck = assetsRef.current.filter(
								(a) => a.balance && a.balance !== '0',
							)
							for (const asset of assetsToCheck) {
								try {
									const remaining = (await client.readContract({
										address: ACCOUNT_KEYCHAIN_ADDRESS,
										abi: [
											{
												name: 'getRemainingLimit',
												type: 'function',
												stateMutability: 'view',
												inputs: [
													{ type: 'address', name: 'account' },
													{ type: 'address', name: 'keyId' },
													{ type: 'address', name: 'token' },
												],
												outputs: [{ type: 'uint256' }],
											},
										],
										functionName: 'getRemainingLimit',
										args: [
											checksummedAddress,
											k.keyId as `0x${string}`,
											asset.address,
										],
									})) as bigint
									if (remaining > 0n) {
										spendingLimits.set(asset.address.toLowerCase(), remaining)
									}
								} catch {
									// Skip if limit fetch fails
								}
							}

							// Get original limits for this key from events
							const keyOriginalLimits =
								originalLimits.get(k.keyId.toLowerCase()) ??
								new Map<string, bigint>()

							return {
								...k,
								enforceLimits: keyData.enforceLimits || spendingLimits.size > 0,
								spendingLimits,
								originalLimits: keyOriginalLimits,
							}
						} catch {
							// If getKey fails, return key without spending limit info
							return {
								...k,
								enforceLimits: false,
								spendingLimits: new Map<string, bigint>(),
								originalLimits: new Map<string, bigint>(),
							}
						}
					}),
				)

				if (!cancelled) {
					setOnChainKeys(keys)

					// Clear pending keys that are now confirmed on-chain
					const confirmedKeyIds = new Set(
						keys.map((k) => k.keyId.toLowerCase()),
					)
					setPendingKeys((prev) =>
						prev.filter((pk) => !confirmedKeyIds.has(pk.keyId.toLowerCase())),
					)

					// Clear revokingKeyIds for keys that no longer exist on-chain
					// (they've been confirmed as revoked)
					setRevokingKeyIds((prev) => {
						const onChainKeyIds = new Set(
							keys.map((k) => k.keyId.toLowerCase()),
						)
						const newRevoking = new Set<string>()
						for (const keyId of prev) {
							// Keep only if key still exists on-chain (still pending revocation)
							if (onChainKeyIds.has(keyId)) {
								newRevoking.add(keyId)
							}
						}
						return newRevoking
					})
				}
			} catch (e) {
				console.error('[AK] Failed to fetch on-chain keys:', e)
			} finally {
				if (!cancelled) {
					setIsLoadingKeys(false)
				}
			}
		}

		fetchOnChainKeys()

		return () => {
			cancelled = true
		}
	}, [checksummedAddress])

	const account = useAccount()
	const { data: connectorClient } = useConnectorClient()
	const [isPending, setIsPending] = React.useState(false)
	const [txHash, setTxHash] = React.useState<`0x${string}` | undefined>()
	const [revokingKeyId, setRevokingKeyId] = React.useState<string | undefined>()
	const { isSuccess: isConfirmed, isLoading: isConfirming } =
		useWaitForTransactionReceipt({
			hash: txHash,
		})

	// Handle revocation confirmation - refetch on-chain state
	React.useEffect(() => {
		if (isConfirmed && revokingKeyId) {
			// Key is already hidden via revokingKeyIds (set optimistically in handleRevoke)
			// Trigger refetch after a delay to get confirmed on-chain state
			const timer = setTimeout(() => {
				setRefetchCounter((c) => c + 1)
			}, 1500)
			// Clean up state
			setRevokingKeyId(undefined)
			setTxHash(undefined)
			return () => clearTimeout(timer)
		}
	}, [isConfirmed, revokingKeyId])

	const isOwner =
		account.address?.toLowerCase() === accountAddress.toLowerCase()
	const assetsWithBalance = assets.filter((a) => a.balance && a.balance !== '0')

	// Map on-chain keys to the expected format for display
	const allKeys = React.useMemo(() => {
		// Deduplicate keys by keyId (keep the latest one) and filter out revoking keys
		const seenKeyIds = new Set<string>()
		const dedupedKeys = onChainKeys.filter((k) => {
			const keyIdLower = k.keyId.toLowerCase()
			if (seenKeyIds.has(keyIdLower)) return false
			if (revokingKeyIds.has(keyIdLower)) return false // Hide keys being revoked
			seenKeyIds.add(keyIdLower)
			return true
		})

		const confirmedKeys: Array<{
			key: AccessKeyForToken
			asset: AssetData
			isPending: boolean
		}> = dedupedKeys.map((k) => {
			// Find the first asset with a spending limit, or use the first asset
			const assetWithLimit = assetsWithBalance.find((a) =>
				k.spendingLimits.has(a.address.toLowerCase()),
			)
			const displayAsset = assetWithLimit ??
				assetsWithBalance[0] ?? {
					address:
						'0x0000000000000000000000000000000000000000' as `0x${string}`,
					name: 'Unknown',
					symbol: '???',
					decimals: 18,
				}
			const assetAddress = assetWithLimit?.address.toLowerCase()
			const spendingLimit = assetAddress
				? k.spendingLimits.get(assetAddress)
				: undefined
			const originalLimit = assetAddress
				? k.originalLimits.get(assetAddress)
				: undefined

			return {
				key: {
					keyId: k.keyId,
					signatureType:
						k.signatureType === 1 ? ('p256' as const) : ('secp256k1' as const),
					expiry: k.expiry * 1000, // Convert to milliseconds for display
					enforceLimits: k.enforceLimits,
					isRevoked: false,
					spendingLimits: k.spendingLimits,
					createdAt: 0, // Not available from events
					spendingLimit,
					originalLimit,
				},
				asset: displayAsset,
				isPending: false,
			}
		})

		// Add pending keys that aren't yet confirmed on-chain
		const confirmedKeyIds = new Set(
			dedupedKeys.map((k) => k.keyId.toLowerCase()),
		)

		const pendingKeyItems: Array<{
			key: AccessKeyForToken
			asset: AssetData
			isPending: boolean
		}> = pendingKeys
			.filter((pk) => !confirmedKeyIds.has(pk.keyId.toLowerCase()))
			.map((pk) => {
				// Find the asset for the pending key's token
				const pendingAsset = pk.tokenAddress
					? assetsWithBalance.find(
							(a) => a.address.toLowerCase() === pk.tokenAddress?.toLowerCase(),
						)
					: undefined
				const displayAsset = pendingAsset ??
					assetsWithBalance[0] ?? {
						address:
							'0x0000000000000000000000000000000000000000' as `0x${string}`,
						metadata: { name: 'Unknown', symbol: '???', decimals: 18 },
						balance: '0',
						valueUsd: 0,
					}

				return {
					key: {
						keyId: pk.keyId,
						signatureType: 'p256' as const,
						expiry: pk.expiry * 1000,
						enforceLimits: pk.spendingLimit !== undefined,
						isRevoked: false,
						spendingLimits: new Map(),
						createdAt: 0,
						spendingLimit: pk.spendingLimit,
						originalLimit: pk.spendingLimit, // Same as spending limit for pending
					},
					asset: displayAsset,
					isPending: true,
				}
			})

		return [...pendingKeyItems, ...confirmedKeys]
	}, [onChainKeys, pendingKeys, assetsWithBalance, revokingKeyIds])

	const handleRevoke = async (keyId: string) => {
		if (!isOwner || !connectorClient?.account) return

		setIsPending(true)
		setRevokingKeyId(keyId)

		try {
			// Call the AccountKeychain precompile to revoke the key
			// This requires the Root Key (passkey) to sign
			const hash = await sendTransaction(connectorClient, {
				to: ACCOUNT_KEYCHAIN_ADDRESS,
				data: encodeFunctionData({
					abi: Abis.accountKeychain,
					functionName: 'revokeKey',
					args: [keyId as `0x${string}`],
				}),
				feeToken: '0x20c000000000000000000000033abb6ac7d235e5',
			})

			setTxHash(hash)
			// Hide the key after tx is sent (user signed)
			setRevokingKeyIds((prev) => new Set(prev).add(keyId.toLowerCase()))
		} catch {
			setRevokingKeyId(undefined)
		} finally {
			setIsPending(false)
		}
	}

	const handleCreate = async (
		tokenAddress: string,
		decimals: number,
		limitUsd: string,
		expDays: number,
		priceUsd: number,
	) => {
		if (!isOwner || !account.address || !connectorClient?.account) return

		// Parse the USD limit and convert to token amount
		const limitUsdNum = Number(limitUsd)
		const limitTokenAmount =
			priceUsd > 0 && limitUsdNum > 0 ? limitUsdNum / priceUsd : 0

		setIsPending(true)
		try {
			// Create a WebCrypto P256 key pair for the access key
			// extractable: true is required so we can derive the public key/address
			const keyPair = await WebCryptoP256.createKeyPair({ extractable: true })

			// Create the access key account with reference to the primary account
			const accessKey = TempoAccount.fromWebCryptoP256(keyPair, {
				access: connectorClient.account,
			})

			// Derive the access key's own address from its public key
			const accessKeyAddress = Address.fromPublicKey(
				keyPair.publicKey,
			).toLowerCase()

			// Store the private key in localStorage so it can be used for signing later
			const privateKeyBytes = await crypto.subtle.exportKey(
				'pkcs8',
				keyPair.privateKey,
			)
			const privateKeyBase64 = btoa(
				String.fromCharCode(...new Uint8Array(privateKeyBytes)),
			)
			localStorage.setItem(
				`accessKey:${accessKeyAddress}`,
				JSON.stringify({ privateKey: privateKeyBase64 }),
			)
			console.log(
				'[AccessKey] Stored private key:',
				`accessKey:${accessKeyAddress}`,
			)

			// Calculate expiry (Unix timestamp)
			const expiry =
				expDays > 0
					? Math.floor((Date.now() + expDays * 86400000) / 1000)
					: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000) // Default 24h

			// Parse spending limit if provided (only if non-zero)
			const limits =
				limitTokenAmount > 0
					? [
							{
								token: tokenAddress as `0x${string}`,
								limit: BigInt(Math.floor(limitTokenAmount * 10 ** decimals)),
							},
						]
					: undefined

			// Have the primary account sign a key authorization for the access key
			// The wagmi connector's account is a Tempo account at runtime (from Account.fromWebAuthnP256)
			// but typed as a standard viem account, so we need to cast it
			const keyAuthorization = await TempoAccount.signKeyAuthorization(
				connectorClient.account as Parameters<
					typeof TempoAccount.signKeyAuthorization
				>[0],
				{
					key: accessKey,
					expiry,
					limits,
				},
			)

			// Create a client with the access key as the account
			// This way the access key signs the tx (no prompt), not the passkey
			const accessKeyClient = createClient({
				account: accessKey,
				chain: connectorClient.chain,
				transport: http(),
			})

			// Send a transaction with the keyAuthorization attached
			// The access key signs the tx (no passkey prompt needed)
			// This registers the access key on-chain via the Tempo transaction format
			const hash = await sendTransaction(accessKeyClient, {
				to: '0x0000000000000000000000000000000000000000',
				feeToken: '0x20c000000000000000000000033abb6ac7d235e5',
				keyAuthorization,
			})

			setTxHash(hash)

			// Optimistically add the key to pending state (shown greyed out)
			// Use derived accessKeyAddress, not accessKey.address which is root account
			const limitAmount =
				limitTokenAmount > 0
					? BigInt(Math.floor(limitTokenAmount * 10 ** decimals))
					: undefined
			setPendingKeys((prev) => [
				...prev,
				{
					keyId: accessKeyAddress,
					expiry,
					tokenAddress: limitTokenAmount > 0 ? tokenAddress : undefined,
					spendingLimit: limitAmount,
				},
			])
		} catch (e) {
			console.error('[AK] create key err', e instanceof Error ? e.message : e, {
				tokenAddress,
				decimals,
				limitUsd,
				expDays,
				priceUsd,
				limitTokenAmount,
			})
		} finally {
			setIsPending(false)
		}

		setShowCreate(false)
		setCreateToken(null)
	}

	// Handle key creation confirmation - refetch to find on-chain key
	const handledTxRef = React.useRef<string | null>(null)
	React.useEffect(() => {
		if (
			isConfirmed &&
			txHash &&
			!revokingKeyId &&
			handledTxRef.current !== txHash
		) {
			handledTxRef.current = txHash
			// Refetch - pending keys get cleared when matching on-chain key is found
			setRefetchCounter((c) => c + 1)
		}
	}, [isConfirmed, txHash, revokingKeyId])

	const headerPill =
		allKeys.length > 0 ? (
			<span className="flex items-center gap-1 px-1 h-[24px] bg-base-alt rounded-md text-[11px] text-secondary">
				<KeyIcon className="size-[12px]" />
				<span className="font-mono font-medium">{allKeys.length}</span>
			</span>
		) : null

	return (
		<Section title="Access Keys" headerRight={headerPill}>
			{isLoadingKeys ? (
				<div className="flex flex-col items-center py-4 gap-2">
					<p className="text-[13px] text-secondary">Loading access keys...</p>
				</div>
			) : allKeys.length === 0 && !showCreate ? (
				<div className="flex flex-col items-center py-4 gap-2">
					<p className="text-[13px] text-secondary">
						No access keys configured.
					</p>
					{isOwner && (
						<button
							type="button"
							onClick={() => {
								setCreateToken(assetsWithBalance[0]?.address ?? null)
								setShowCreate(true)
							}}
							disabled={isPending || assetsWithBalance.length === 0}
							className="text-[11px] font-medium bg-accent/10 text-accent rounded px-2 py-1 cursor-pointer press-down hover:bg-accent/20 transition-colors"
						>
							Create Key
						</button>
					)}
				</div>
			) : (
				<div className="flex flex-col -mx-2">
					{allKeys.map(({ key, asset, isPending: isKeyPending }) => (
						<div
							key={key.keyId}
							className={cx(
								'flex items-center gap-2.5 px-3 h-[48px] rounded-xl hover:glass-thin transition-all',
								isKeyPending && 'opacity-50',
							)}
						>
							<TokenIcon address={asset.address} className="size-[24px]" />
							<span className="flex flex-col flex-1 min-w-0">
								<span className="text-[12px] text-primary font-mono break-all">
									{key.keyId}
									{isKeyPending && (
										<span className="ml-1 text-[10px] text-tertiary">
											(confirming...)
										</span>
									)}
								</span>
								<span className="text-[10px] text-tertiary flex items-center gap-1.5 flex-wrap">
									{asset.metadata?.symbol && (
										<>
											<a
												href={`https://explore.mainnet.tempo.xyz/token/${asset.address}`}
												target="_blank"
												rel="noopener noreferrer"
												className="text-secondary font-medium hover:text-accent transition-colors"
											>
												{asset.metadata.symbol}
											</a>
											<span>·</span>
										</>
									)}
									{key.spendingLimit !== undefined && key.spendingLimit > 0n ? (
										<>
											<span>
												{formatBigIntAmount(
													key.spendingLimit,
													asset.metadata?.decimals ?? 6,
												)}
												{key.originalLimit !== undefined &&
												key.originalLimit > 0n ? (
													<>
														{' / '}
														{formatBigIntAmount(
															key.originalLimit,
															asset.metadata?.decimals ?? 6,
														)}
													</>
												) : null}{' '}
												remaining
											</span>
											<span>·</span>
										</>
									) : (
										<>
											<span>Unlimited</span>
											<span>·</span>
										</>
									)}
									<span
										className={
											key.expiry > 0 && key.expiry <= Date.now()
												? 'text-negative'
												: ''
										}
									>
										{key.expiry === 0
											? 'No expiry'
											: key.expiry <= Date.now()
												? 'Expired'
												: `${formatExpiry(key.expiry)} left`}
									</span>
								</span>
							</span>
							{isOwner && !isKeyPending && (
								<button
									type="button"
									onClick={() => handleRevoke(key.keyId)}
									disabled={isPending}
									className="text-[11px] font-medium bg-negative/10 text-negative rounded px-1.5 py-0.5 cursor-pointer press-down hover:bg-negative/20 transition-colors disabled:opacity-50"
								>
									Revoke
								</button>
							)}
						</div>
					))}

					{showCreate && createToken && (
						<CreateKeyInline
							assets={assetsWithBalance}
							selectedToken={createToken}
							onTokenChange={setCreateToken}
							isPending={isPending}
							onCancel={() => {
								setShowCreate(false)
								setCreateToken(null)
							}}
							onCreate={handleCreate}
						/>
					)}

					{!showCreate && isOwner && (
						<button
							type="button"
							onClick={() => {
								setCreateToken(assetsWithBalance[0]?.address ?? null)
								setShowCreate(true)
							}}
							disabled={isPending}
							className="flex items-center gap-1 px-3 h-[36px] text-[11px] text-secondary hover:text-accent transition-colors cursor-pointer"
						>
							<PlusIcon className="size-[12px]" />
							<span>Add key</span>
						</button>
					)}
				</div>
			)}
		</Section>
	)
}

function DollarInput({
	value,
	onChange,
	placeholder = '0.00',
	className,
}: {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	className?: string
}) {
	const inputRef = React.useRef<HTMLInputElement>(null)

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value.replace(/[^0-9.]/g, '')
		const parts = raw.split('.')
		if (parts.length > 2) return
		if (parts[1] && parts[1].length > 2) return
		onChange(raw)
	}

	return (
		<div
			className={cx(
				'h-[28px] px-2 text-[11px] rounded border border-base-border bg-surface flex items-center cursor-text',
				className,
			)}
			onClick={() => inputRef.current?.focus()}
			onKeyDown={() => inputRef.current?.focus()}
		>
			<span className={value ? 'text-primary' : 'text-tertiary'}>$</span>
			<input
				ref={inputRef}
				type="text"
				inputMode="decimal"
				value={value}
				onChange={handleChange}
				placeholder={placeholder}
				className="bg-transparent outline-none w-full placeholder:text-tertiary"
			/>
		</div>
	)
}

function CreateKeyInline({
	assets,
	selectedToken,
	onTokenChange,
	isPending,
	onCancel,
	onCreate,
}: {
	assets: AssetData[]
	selectedToken: Address.Address
	onTokenChange: (token: Address.Address) => void
	isPending: boolean
	onCancel: () => void
	onCreate: (
		tokenAddress: string,
		decimals: number,
		limitUsd: string,
		expDays: number,
		priceUsd: number,
	) => void
}) {
	const [limitUsd, setLimitUsd] = React.useState('')
	const [expDays, setExpDays] = React.useState('7')
	const asset = assets.find((a) => a.address === selectedToken)

	return (
		<div className="flex flex-col gap-3 px-3 py-3 bg-base-alt/30 rounded-lg mx-2">
			<div className="flex items-center gap-3">
				<div className="flex flex-col gap-1">
					<label className="text-[9px] text-tertiary uppercase tracking-wide">
						Token
					</label>
					<select
						value={selectedToken}
						onChange={(e) => onTokenChange(e.target.value as Address.Address)}
						className="h-[28px] px-2 text-[11px] rounded border border-base-border bg-surface min-w-[80px]"
					>
						{assets.map((a) => (
							<option key={a.address} value={a.address}>
								{a.metadata?.symbol || shortenAddress(a.address, 3)}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-[9px] text-tertiary uppercase tracking-wide">
						Limit
					</label>
					<DollarInput
						value={limitUsd}
						onChange={setLimitUsd}
						placeholder="0.00"
						className="w-[80px]"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-[9px] text-tertiary uppercase tracking-wide">
						Expires
					</label>
					<div className="flex items-center gap-1">
						<input
							type="number"
							value={expDays}
							onChange={(e) => setExpDays(e.target.value)}
							placeholder="7"
							className="h-[28px] w-[50px] px-2 text-[11px] rounded border border-base-border bg-surface"
						/>
						<span className="text-[10px] text-tertiary">days</span>
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={() =>
						onCreate(
							selectedToken,
							asset?.metadata?.decimals ?? 6,
							limitUsd,
							Number(expDays),
							asset?.metadata?.priceUsd ?? 1,
						)
					}
					disabled={isPending}
					className="text-[11px] font-medium bg-accent text-white rounded px-2 py-1 cursor-pointer press-down hover:bg-accent/90 transition-colors disabled:opacity-50"
				>
					{isPending ? '...' : 'Create'}
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="text-[11px] text-secondary hover:text-primary transition-colors cursor-pointer"
				>
					Cancel
				</button>
			</div>
		</div>
	)
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
					<div key={`w-${wi}`} className="flex flex-col gap-[3px] flex-1">
						{week.map((cell, di) => (
							<div
								key={`d-${wi}-${di}`}
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

// Access key info for send UI
type AccessKeyForSend = {
	keyId: string
	spendingLimit: bigint
	originalLimit: bigint
	createdAt?: number // Unix timestamp in ms
}

function HoldingsTable({
	assets,
	address,
	onFaucetSuccess,
	isOwnProfile,
	connectedAddress,
	initialSendTo,
	initialToken,
}: {
	assets: AssetData[]
	address: string
	onFaucetSuccess?: () => void
	isOwnProfile: boolean
	connectedAddress?: string
	initialSendTo?: string
	initialToken?: string
}) {
	const navigate = useNavigate()
	const [sendingToken, setSendingToken] = React.useState<string | null>(
		initialToken ?? null,
	)
	const [toastMessage, setToastMessage] = React.useState<{
		message: string
		txHash?: string
	} | null>(null)

	// Access keys per token address (for send UI)
	const [accessKeysByToken, setAccessKeysByToken] = React.useState<
		Map<string, AccessKeyForSend[]>
	>(new Map())

	// Fetch access keys for this address
	React.useEffect(() => {
		if (typeof window === 'undefined' || !isOwnProfile) return
		let cancelled = false

		const fetchAccessKeys = async () => {
			try {
				const chain = getTempoChain()
				const client = createPublicClient({
					chain,
					transport: http(),
				})

				const checksummedAddress = Address.checksum(address as Address.Address)
				const blockNumber = await client.getBlockNumber()
				const fromBlock = blockNumber > 99000n ? blockNumber - 99000n : 0n

				// Fetch KeyAuthorized events
				const authorizedLogs = await getLogs(client, {
					address: ACCOUNT_KEYCHAIN_ADDRESS,
					event: {
						type: 'event',
						name: 'KeyAuthorized',
						inputs: [
							{ type: 'address', name: 'account', indexed: true },
							{ type: 'address', name: 'publicKey', indexed: true },
							{ type: 'uint8', name: 'signatureType' },
							{ type: 'uint64', name: 'expiry' },
						],
					},
					args: { account: checksummedAddress },
					fromBlock,
					toBlock: 'latest',
				})

				// Fetch KeyRevoked events
				const revokedLogs = await getLogs(client, {
					address: ACCOUNT_KEYCHAIN_ADDRESS,
					event: {
						type: 'event',
						name: 'KeyRevoked',
						inputs: [
							{ type: 'address', name: 'account', indexed: true },
							{ type: 'address', name: 'publicKey', indexed: true },
						],
					},
					args: { account: checksummedAddress },
					fromBlock,
					toBlock: 'latest',
				})

				// Fetch SpendingLimitUpdated events
				const spendingLimitLogs = await getLogs(client, {
					address: ACCOUNT_KEYCHAIN_ADDRESS,
					event: {
						type: 'event',
						name: 'SpendingLimitUpdated',
						inputs: [
							{ type: 'address', name: 'account', indexed: true },
							{ type: 'address', name: 'keyId', indexed: true },
							{ type: 'address', name: 'token', indexed: true },
							{ type: 'uint256', name: 'newLimit' },
						],
					},
					args: { account: checksummedAddress },
					fromBlock,
					toBlock: 'latest',
				})

				// Build original limits map
				const originalLimits = new Map<string, Map<string, bigint>>()
				for (const log of spendingLimitLogs) {
					if (log.args.keyId && log.args.token && log.args.newLimit) {
						const keyIdLower = (log.args.keyId as string).toLowerCase()
						const tokenLower = (log.args.token as string).toLowerCase()
						let keyLimits = originalLimits.get(keyIdLower)
						if (!keyLimits) {
							keyLimits = new Map()
							originalLimits.set(keyIdLower, keyLimits)
						}
						if (!keyLimits.has(tokenLower)) {
							keyLimits.set(tokenLower, log.args.newLimit as bigint)
						}
					}
				}

				// Build revoked set
				const revokedKeyIds = new Set<string>()
				for (const log of revokedLogs) {
					if (log.args.publicKey) {
						revokedKeyIds.add(log.args.publicKey.toLowerCase())
					}
				}

				// Get valid keys
				const validKeys = authorizedLogs
					.filter(
						(log) =>
							log.args.publicKey &&
							!revokedKeyIds.has(log.args.publicKey.toLowerCase()),
					)
					.map((log) => ({
						keyId: log.args.publicKey as string,
						expiry: Number(log.args.expiry ?? 0),
						blockNumber: log.blockNumber,
					}))
					.filter(
						(k) => k.expiry === 0 || k.expiry > Math.floor(Date.now() / 1000),
					)

				// Fetch block timestamps for creation times
				const uniqueBlockNumbers = [
					...new Set(validKeys.map((k) => k.blockNumber)),
				]
				const blockTimestamps = new Map<bigint, number>()
				await Promise.all(
					uniqueBlockNumbers.map(async (bn) => {
						try {
							const block = await client.getBlock({ blockNumber: bn })
							blockTimestamps.set(bn, Number(block.timestamp) * 1000)
						} catch {
							// Ignore if block fetch fails
						}
					}),
				)

				// Build access keys by token - include ALL valid keys for ALL tokens
				// Keys without spending limits can be used for any token (unlimited)
				const keysByToken = new Map<string, AccessKeyForSend[]>()
				for (const key of validKeys) {
					const keyIdLower = key.keyId.toLowerCase()
					const keyOriginalLimits = originalLimits.get(keyIdLower)

					for (const asset of assets) {
						const tokenLower = asset.address.toLowerCase()
						const origLimit = keyOriginalLimits?.get(tokenLower)

						// If key has a spending limit for this token, fetch remaining
						if (origLimit && origLimit > 0n) {
							try {
								const remaining = (await client.readContract({
									address: ACCOUNT_KEYCHAIN_ADDRESS,
									abi: [
										{
											name: 'getRemainingLimit',
											type: 'function',
											stateMutability: 'view',
											inputs: [
												{ type: 'address', name: 'account' },
												{ type: 'address', name: 'keyId' },
												{ type: 'address', name: 'token' },
											],
											outputs: [{ type: 'uint256' }],
										},
									],
									functionName: 'getRemainingLimit',
									args: [
										checksummedAddress,
										key.keyId as `0x${string}`,
										asset.address,
									],
								})) as bigint

								if (remaining > 0n) {
									const existing = keysByToken.get(tokenLower) ?? []
									existing.push({
										keyId: key.keyId,
										spendingLimit: remaining,
										originalLimit: origLimit,
										createdAt: blockTimestamps.get(key.blockNumber),
									})
									keysByToken.set(tokenLower, existing)
								}
							} catch {
								// Skip if limit fetch fails
							}
						} else {
							// No spending limit = unlimited for this token
							const existing = keysByToken.get(tokenLower) ?? []
							existing.push({
								keyId: key.keyId,
								spendingLimit: 0n, // 0 means unlimited
								originalLimit: 0n,
								createdAt: blockTimestamps.get(key.blockNumber),
							})
							keysByToken.set(tokenLower, existing)
						}
					}
				}

				if (!cancelled) {
					console.log(
						'[HoldingsTable] Access keys by token:',
						Object.fromEntries(keysByToken),
					)
					setAccessKeysByToken(keysByToken)
				}
			} catch (e) {
				console.error('[HoldingsTable] Failed to fetch access keys:', e)
			}
		}

		fetchAccessKeys()
		return () => {
			cancelled = true
		}
	}, [address, isOwnProfile, assets])

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
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 6v12M6 12h12" strokeLinecap="round" />
					</svg>
				</div>
				<p className="text-[13px] text-secondary">No assets found</p>
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
						onSendComplete={(symbol, txHash) => {
							setToastMessage({
								message: `Sent ${symbol} successfully`,
								txHash,
							})
							setSendingToken(null)
						}}
						onFaucetSuccess={onFaucetSuccess}
						isOwnProfile={isOwnProfile}
						initialRecipient={
							asset.address === initialToken ? initialSendTo : undefined
						}
						accessKeys={
							accessKeysByToken.get(asset.address.toLowerCase()) ?? []
						}
					/>
				))}
			</div>
			{toastMessage &&
				createPortal(
					<div className="fixed bottom-4 right-4 z-50 bg-surface rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.12)] overflow-hidden flex">
						<div className="w-1 bg-positive shrink-0" />
						<div className="flex flex-col gap-0.5 px-3 py-2 items-start">
							<span className="flex items-center gap-1.5 text-[13px] text-primary font-medium">
								<CheckIcon className="size-[14px] text-positive" />
								{toastMessage.message}
							</span>
							{toastMessage.txHash && (
								<a
									href={`https://explore.mainnet.tempo.xyz/tx/${toastMessage.txHash}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-[11px] text-accent hover:underline"
								>
									View on Explorer →
								</a>
							)}
						</div>
					</div>,
					document.body,
				)}
		</>
	)
}

function BouncingDots() {
	return (
		<span className="inline-flex gap-[2px]">
			<span className="size-[4px] bg-current rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" />
			<span className="size-[4px] bg-current rounded-full animate-[bounce_0.6s_ease-in-out_0.1s_infinite]" />
			<span className="size-[4px] bg-current rounded-full animate-[bounce_0.6s_ease-in-out_0.2s_infinite]" />
		</span>
	)
}

function AssetRow({
	asset,
	address,
	isFaucetToken,
	isExpanded,
	onToggleSend,
	onSendComplete,
	onFaucetSuccess,
	isOwnProfile,
	initialRecipient,
	accessKeys,
}: {
	asset: AssetData
	address: string
	isFaucetToken: boolean
	isExpanded: boolean
	onToggleSend: () => void
	onSendComplete: (symbol: string, txHash?: string) => void
	onFaucetSuccess?: () => void
	isOwnProfile: boolean
	initialRecipient?: string
	accessKeys: AccessKeyForSend[]
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

	// Handle transaction confirmation
	React.useEffect(() => {
		if (isConfirmed && txHash) {
			setSendState('sent')
			setTimeout(() => {
				setSendState('idle')
				setRecipient('')
				setAmount('')
				resetWrite()
				onSendComplete(
					asset.metadata?.symbol || shortenAddress(asset.address, 3),
					txHash,
				)
			}, 1500)
		}
	}, [
		isConfirmed,
		txHash,
		asset.metadata?.symbol,
		asset.address,
		onSendComplete,
		resetWrite,
	])

	// Handle write errors
	React.useEffect(() => {
		if (writeError) {
			setSendState('error')
			const shortMessage =
				'shortMessage' in writeError
					? (writeError.shortMessage as string)
					: writeError.message
			setSendError(shortMessage || 'Transaction failed')
			setTimeout(() => {
				setSendState('idle')
				setSendError(null)
				resetWrite()
			}, 3000)
		}
	}, [writeError, resetWrite])

	// Update send state based on pending/confirming
	React.useEffect(() => {
		if (isPending || isConfirming) {
			setSendState('sending')
		}
	}, [isPending, isConfirming])

	const handleFaucet = async () => {
		setFaucetState('loading')
		try {
			const result = await faucetFundAddress({ data: { address } })
			if (!result.success) {
				console.error('Faucet error:', result.error)
				setFaucetState('idle')
				return
			}
			setFaucetState('done')
			// Delay refresh to let the transaction propagate
			setTimeout(() => {
				setFaucetState('idle')
				onFaucetSuccess?.()
			}, 2000)
		} catch (err) {
			console.error('Faucet error:', err)
			setFaucetState('idle')
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
					setSendError(
						'Access key not found in local storage. Keys created on another device cannot be used here.',
					)
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
						hash,
					)
				}, 1500)
			} catch (e) {
				console.error('[AssetRow] Access key send error:', e)
				setSendError(e instanceof Error ? e.message : 'Transaction failed')
				setSendState('error')
				setTimeout(() => {
					setSendState('idle')
					setSendError(null)
				}, 3000)
			}
			return
		}

		// Default: use wallet to sign
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
				className="flex flex-col gap-1.5 px-2 py-2 rounded-xl hover:glass-thin transition-all"
			>
				{/* Row 1: Token icon + Recipient */}
				<div className="flex items-center gap-1.5">
					<TokenIcon address={asset.address} className="size-[24px] shrink-0" />
					<input
						ref={recipientInputRef}
						type="text"
						value={recipient}
						onChange={(e) => setRecipient(e.target.value)}
						placeholder="Recipient 0x..."
						className="flex-1 min-w-0 h-[28px] px-3 rounded-full border border-base-border bg-surface text-[12px] font-mono placeholder:font-sans placeholder:text-tertiary focus:outline-none focus:border-accent"
					/>
				</div>

				{/* Row 2: Amount + Actions */}
				<div className="flex items-center gap-1.5 pl-[30px]">
					<div className="relative flex-1">
						<input
							ref={amountInputRef}
							type="text"
							inputMode="decimal"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							placeholder="Amount"
							className="w-full h-[28px] pl-3 pr-12 rounded-full border border-base-border bg-surface text-[12px] font-mono placeholder:font-sans placeholder:text-tertiary focus:outline-none focus:border-accent"
						/>
						<button
							type="button"
							onClick={handleMax}
							className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-accent hover:text-accent/70 cursor-pointer transition-colors"
						>
							MAX
						</button>
					</div>
					<button
						type="submit"
						className={cx(
							'h-[28px] px-3 rounded-full press-down transition-colors flex items-center justify-center gap-1 shrink-0 text-[11px] font-medium',
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
							<CheckIcon className="size-[12px]" />
						) : sendState === 'error' ? (
							<XIcon className="size-[12px]" />
						) : (
							<>
								<SendIcon className="size-[12px]" />
								<span>Send</span>
							</>
						)}
					</button>
					<button
						type="button"
						onClick={handleToggle}
						className="size-[28px] flex items-center justify-center cursor-pointer text-tertiary hover:text-primary hover:bg-base-alt rounded-full transition-colors shrink-0"
						title="Cancel"
					>
						<XIcon className="size-[14px]" />
					</button>
				</div>
				{accessKeys.length > 0 && (
					<div className="flex items-center gap-2 pl-[30px]">
						<span className="text-[11px] text-tertiary">Sign with:</span>
						<select
							value={selectedAccessKey ?? ''}
							onChange={(e) => setSelectedAccessKey(e.target.value || null)}
							className="h-[24px] px-2 rounded-md border border-base-border bg-surface text-[11px] focus:outline-none focus:border-accent cursor-pointer"
						>
							<option value="">Wallet (default)</option>
							{[...accessKeys]
								.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
								.map((ak) => (
									<option key={ak.keyId} value={ak.keyId}>
										{shortenAddress(ak.keyId, 4)} ·{' '}
										{ak.spendingLimit === 0n
											? 'Unlimited'
											: `${formatBigIntAmount(
													ak.spendingLimit,
													asset.metadata?.decimals ?? 6,
												)} left`}
										{ak.createdAt ? ` · ${formatCreatedAt(ak.createdAt)}` : ''}
									</option>
								))}
						</select>
					</div>
				)}
				{sendError && (
					<div className="pl-9 sm:pl-[36px] text-[11px] text-negative truncate">
						{sendError}
					</div>
				)}
			</form>
		)
	}

	const explorerUrl = `https://explore.mainnet.tempo.xyz/address/${asset.address}`

	return (
		<div
			className="group grid grid-cols-[1fr_auto_60px_auto] md:grid-cols-[1fr_auto_60px_90px_auto] gap-1 rounded-xl hover:glass-thin transition-all"
			style={{ height: ROW_HEIGHT }}
		>
			<a
				href={explorerUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="px-2 text-primary flex items-center gap-2 hover:opacity-80 transition-opacity"
			>
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
			</a>
			<span
				className="px-2 flex items-center justify-end overflow-hidden min-w-0"
				title={
					asset.balance !== undefined && asset.metadata?.decimals !== undefined
						? formatAmount(asset.balance, asset.metadata.decimals)
						: undefined
				}
			>
				<span className="flex flex-col items-end min-w-0">
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
						disabled={faucetState === 'loading' || !isFaucetToken}
						className={cx(
							'flex items-center justify-center size-[24px] rounded-md transition-colors',
							isFaucetToken
								? 'hover:bg-accent/10 cursor-pointer'
								: 'opacity-0 pointer-events-none',
						)}
						title={isFaucetToken ? 'Request tokens' : undefined}
						aria-hidden={!isFaucetToken}
					>
						{faucetState === 'loading' ? (
							<BouncingDots />
						) : faucetState === 'done' ? (
							<CheckIcon className="size-[14px] text-positive" />
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

function ActivityList({
	activity,
	address,
}: {
	activity: ActivityItem[]
	address: string
}) {
	const viewer = address as Address.Address
	const { t } = useTranslation()

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

	const transformEvent = (event: KnownEvent) =>
		getPerspectiveEvent(event, viewer)

	return (
		<div className="text-[13px] -mx-2">
			{activity.map((item) => (
				<ActivityRow
					key={item.hash}
					item={item}
					viewer={viewer}
					transformEvent={transformEvent}
				/>
			))}
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
	const [showModal, setShowModal] = React.useState(false)

	return (
		<>
			<div className="group flex items-center gap-2 px-3 h-[48px] rounded-xl hover:glass-thin transition-all">
				<TxDescription.ExpandGroup
					events={item.events}
					seenAs={viewer}
					transformEvent={transformEvent}
					limitFilter={preferredEventsFilter}
					emptyContent="Transaction"
				/>
				<a
					href={`https://explore.mainnet.tempo.xyz/tx/${item.hash}`}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center justify-center size-[24px] rounded-md hover:bg-base-alt shrink-0 transition-all opacity-60 group-hover:opacity-100"
					title="View on Explorer"
				>
					<ExternalLinkIcon className="size-[14px] text-tertiary hover:text-accent transition-colors" />
				</a>
				<button
					type="button"
					onClick={() => setShowModal(true)}
					className="flex items-center justify-center size-[24px] rounded-md hover:bg-base-alt shrink-0 cursor-pointer transition-all opacity-60 group-hover:opacity-100"
					title="View receipt"
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

function formatCreatedAt(timestamp: number): string {
	const now = Date.now()
	const diff = now - timestamp

	const minutes = Math.floor(diff / 60000)
	const hours = Math.floor(diff / 3600000)
	const days = Math.floor(diff / 86400000)

	if (minutes < 1) return 'just now'
	if (minutes < 60) return `${minutes}m ago`
	if (hours < 24) return `${hours}h ago`
	if (days < 7) return `${days}d ago`

	return new Date(timestamp).toLocaleDateString()
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
		<div
			ref={overlayRef}
			className={cx(
				'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200',
				isVisible ? 'opacity-100' : 'opacity-0',
			)}
			onClick={handleClose}
		>
			<div
				ref={contentRef}
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
					className="flex flex-col w-[360px] liquid-glass-premium border-b-0 rounded-[16px] rounded-br-none rounded-bl-none text-base-content"
				>
					<div className="flex gap-[40px] px-[20px] pt-[24px] pb-[16px]">
						<div className="shrink-0">
							<ReceiptMark />
						</div>
						<div className="flex flex-col gap-[8px] font-mono text-[13px] leading-[16px] flex-1">
							<div className="flex justify-between items-end">
								<span className="text-tertiary">Block</span>
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
								<span className="text-tertiary shrink-0">Sender</span>
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
								<span className="text-tertiary shrink-0">Hash</span>
								<span className="text-right">{shortenAddress(hash, 6)}</span>
							</div>
							<div className="flex justify-between items-end">
								<span className="text-tertiary">Date</span>
								<span className="text-right">{formattedDate}</span>
							</div>
							<div className="flex justify-between items-end">
								<span className="text-tertiary">Time</span>
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
						className="press-down text-[13px] font-sans px-[12px] py-[12px] flex items-center justify-center gap-[8px] glass-button rounded-bl-[16px] rounded-br-[16px] text-tertiary hover:text-primary -mt-px"
					>
						<span>View transaction</span>
						<span aria-hidden="true">→</span>
					</a>
				</div>
			</div>
		</div>
	)
}
