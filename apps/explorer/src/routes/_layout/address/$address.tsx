import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	rootRouteId,
	stripSearchParams,
	useLocation,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as React from 'react'
import type { RpcTransaction as Transaction } from 'viem'
import { formatUnits, isHash } from 'viem'
import { useChainId, usePublicClient } from 'wagmi'
import type { GetBlockReturnType } from 'wagmi/actions'
import { Actions } from 'wagmi/tempo'
import type { Config } from 'wagmi'
import * as z from 'zod/mini'
import { Amount } from '#comps/Amount'
import { AccountCard } from '#comps/AccountCard'
import { AddressCell } from '#comps/AddressCell'
import { AmountCell, BalanceCell } from '#comps/AmountCell'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { ContractTabContent, InteractTabContent } from '#comps/Contract'
import { Tip20TokenTabContent } from '#comps/Tip20ContractInfo'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import {
	TimeColumnHeader,
	type TimeFormat,
	useTimeFormat,
} from '#comps/TimeFormat'
import { TimestampCell } from '#comps/TimestampCell'
import { TokenIcon } from '#comps/TokenIcon'
import { TransactionCell } from '#comps/TransactionCell'
import {
	BatchTransactionDataContext,
	type TransactionData,
	TransactionDescription,
	TransactionTimestamp,
	TransactionTotal,
	useTransactionDataFromBatch,
} from '#comps/TxTransactionRow'
import { cx } from '#lib/css'
import { type AccountType, getAccountType } from '#lib/account'
import {
	type ContractSource,
	useContractSourceQueryOptions,
} from '#lib/domain/contract-source'
import {
	type ContractInfo,
	extractContractAbi,
	getContractBytecode,
	getContractInfo,
} from '#lib/domain/contracts'
import { parseKnownEvents } from '#lib/domain/known-events'
import type { KnownEventPart } from '#lib/domain/known-events'
import * as Tip20 from '#lib/domain/tip20'
import { DateFormatter, HexFormatter, PriceFormatter } from '#lib/formatting'
import { useIsMounted, useMediaQuery } from '#lib/hooks'
import { buildAddressDescription, buildAddressOgImageUrl } from '#lib/og'
import { withLoaderTiming } from '#lib/profiling'
import {
	type HistoryResponse,
	type HistorySources,
	historyQueryOptions,
	transactionsQueryOptions,
} from '#lib/queries/account'
import { transfersQueryOptions, holdersQueryOptions } from '#lib/queries/tokens'
import { getApiUrl } from '#lib/env.ts'
import { getWagmiConfig } from '#wagmi.config.ts'
import type { EnrichedTransaction } from '#routes/api/address/history/$address.ts'
import XIcon from '~icons/lucide/x'

type TokenMetadata = Actions.token.getMetadata.ReturnValue

async function fetchAddressTotalValue(address: Address.Address) {
	const response = await fetch(
		getApiUrl(`/api/address/total-value/${address}`),
		{ headers: { 'Content-Type': 'application/json' } },
	)
	return response.json() as Promise<{ totalValue: number }>
}

type TokenBalance = {
	token: Address.Address
	balance: string
	name?: string
	symbol?: string
	decimals?: number
	currency?: string
}

async function fetchAddressBalances(address: Address.Address) {
	const response = await fetch(getApiUrl(`/api/address/balances/${address}`), {
		headers: { 'Content-Type': 'application/json' },
	})
	return response.json() as Promise<{
		balances: TokenBalance[]
		error?: string
	}>
}

type AssetData = {
	address: Address.Address
	metadata:
		| { name?: string; symbol?: string; decimals?: number; currency?: string }
		| undefined
	balance: bigint | undefined
}

function balancesQueryOptions(address: Address.Address) {
	return {
		queryKey: ['address-balances', address],
		queryFn: () => fetchAddressBalances(address),
		staleTime: 60_000,
	}
}

function useBalancesData(
	accountAddress: Address.Address,
	initialData?: { balances: TokenBalance[] },
	enabled = true,
): {
	data: AssetData[]
	isLoading: boolean
} {
	const { data, isLoading } = useQuery({
		...balancesQueryOptions(accountAddress),
		initialData,
		enabled,
	})

	const assetsData = React.useMemo(() => {
		if (!data?.balances) return []
		return data.balances.map((token) => ({
			address: token.token,
			metadata: {
				name: token.name,
				symbol: token.symbol,
				decimals: token.decimals,
				currency: token.currency,
			},
			balance: BigInt(token.balance),
		}))
	}, [data])

	return { data: assetsData, isLoading }
}

/**
 * Client-side batch transaction data fetching for token addresses.
 * Fetches receipts, blocks, and parses known events via RPC calls.
 * Used for tokens to avoid the expensive server-side history API.
 */
function useBatchTransactionData(
	transactions: Transaction[],
	viewer: Address.Address,
	enabled = true,
) {
	const hashes = React.useMemo(
		() => transactions.map((tx) => tx.hash).filter(isHash),
		[transactions],
	)

	const chainId = useChainId()
	const client = usePublicClient({ chainId })
	const canFetch = enabled && hashes.length > 0 && Boolean(client)

	const queries = useQueries({
		queries: hashes.map((hash) => ({
			queryKey: ['tx-data-batch', viewer, hash],
			queryFn: async (): Promise<TransactionData | null> => {
				const activeClient = client
				if (!activeClient) return null
				const receipt = await activeClient.getTransactionReceipt({ hash })
				const [block, transaction, getTokenMetadata] = await Promise.all([
					activeClient.getBlock({ blockHash: receipt.blockHash }),
					activeClient.getTransaction({ hash: receipt.transactionHash }),
					Tip20.metadataFromLogs(receipt.logs),
				])
				const knownEvents = parseKnownEvents(receipt, {
					transaction,
					getTokenMetadata,
					viewer,
				})
				return { receipt, block: block as GetBlockReturnType, knownEvents }
			},
			staleTime: 60_000,
			enabled: canFetch,
		})),
	})

	const transactionDataMap = React.useMemo(() => {
		const map = new Map<Hex.Hex, TransactionData>()
		for (let index = 0; index < hashes.length; index++) {
			const data = queries[index]?.data
			if (data) map.set(hashes[index], data)
		}
		return map
	}, [hashes, queries])

	const isLoading = canFetch && queries.some((q) => q.isLoading)

	return { transactionDataMap, isLoading }
}

function calculateTotalHoldings(assetsData: AssetData[]): number | undefined {
	const PRICE_PER_TOKEN = 1
	let total: number | undefined
	for (const asset of assetsData) {
		if (asset.metadata?.currency !== 'USD') continue
		const decimals = asset.metadata?.decimals
		const balance = asset.balance
		if (decimals === undefined || balance === undefined) continue
		total =
			(total ?? 0) + Number(formatUnits(balance, decimals)) * PRICE_PER_TOKEN
	}
	return total
}

const defaultSearchValues = {
	page: 1,
	limit: 10,
	tab: 'transactions',
} as const

const ASSETS_PER_PAGE = 10

const allTabs = [
	'transactions',
	'holdings',
	'transfers',
	'holders',
	'token',
	'contract',
	'interact',
] as const

type TabValue = (typeof allTabs)[number]

const TabSchema = z.prefault(
	z.pipe(
		z.string(),
		z.transform((val): TabValue => {
			if (val === 'history') return 'transactions'
			if (val === 'assets') return 'holdings'
			if (allTabs.includes(val as TabValue)) return val as TabValue
			return 'transactions'
		}),
	),
	defaultSearchValues.tab,
)

export const Route = createFileRoute('/_layout/address/$address')({
	component: RouteComponent,
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Address Not Found"
			message="The address is invalid or could not be found."
			data={data as NotFound.NotFoundData}
		/>
	),
	validateSearch: z.object({
		page: z.prefault(z.number(), defaultSearchValues.page),
		limit: z.prefault(
			z.pipe(
				z.number(),
				z.transform((val) => Math.min(100, val)),
			),
			defaultSearchValues.limit,
		),
		tab: TabSchema,
		live: z.prefault(z.boolean(), false),
		a: z.optional(z.string()),
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loaderDeps: ({ search: { page, limit, live, tab, a } }) => ({
		page,
		limit,
		live,
		tab,
		a,
	}),
	loader: ({ deps: { page, limit, live, tab, a }, params, context }) =>
		withLoaderTiming('/_layout/address/$address', async () => {
			const { address } = params
			// Only throw notFound for truly invalid addresses
			if (!Address.validate(address))
				throw notFound({
					routeId: rootRouteId,
					data: { error: 'Invalid address format' },
				})

			const offset = (page - 1) * limit
			const account =
				a && Address.validate(a) ? (a as Address.Address) : undefined

			// Tab-aware loading: only fetch data needed for the active tab
			const isTransactionsTab = tab === 'transactions'
			const isHoldingsTab = tab === 'holdings'

			// Add timeout to prevent SSR from hanging on slow queries
			const QUERY_TIMEOUT_MS = 3_000
			const timeout = <T,>(
				promise: Promise<T>,
				ms: number,
			): Promise<T | undefined> =>
				Promise.race([
					promise,
					new Promise<undefined>((r) => setTimeout(() => r(undefined), ms)),
				])

			const config = getWagmiConfig()

			// Always fetch bytecode (needed for account type detection)
			const contractBytecodePromise = timeout(
				getContractBytecode(address).catch((error) => {
					console.error('[loader] Failed to get bytecode:', error)
					return undefined
				}),
				QUERY_TIMEOUT_MS,
			)

			// Try to fetch token metadata (non-blocking, used for isToken detection)
			const tokenMetadataPromise = timeout(
				Actions.token
					.getMetadata(config as Config, { token: address })
					.catch(() => null),
				QUERY_TIMEOUT_MS,
			)

			// Only block on transactions if transactions tab is active
			// SSR uses safe default (no 'emitted' source) since we don't know if it's a token yet
			// Client will refetch with correct sources based on isToken
			const transactionsPromise = isTransactionsTab
				? timeout(
						context.queryClient
							.ensureQueryData(
								historyQueryOptions({
									address,
									page,
									limit,
									offset,
									sources: ['txs', 'transfers'],
								}),
							)
							.catch((error) => {
								console.error('Fetch transactions error:', error)
								return undefined
							}),
						QUERY_TIMEOUT_MS,
					)
				: Promise.resolve(undefined)

			// Fire off total-value (non-blocking) and balances in parallel with other loaders
			context.queryClient
				.ensureQueryData({
					queryKey: ['account-total-value', address],
					queryFn: () => fetchAddressTotalValue(address),
					staleTime: 60_000,
				})
				.catch((error) => {
					console.error('Fetch total-value error (non-blocking):', error)
				})

			const balancesPromise = isHoldingsTab
				? timeout(
						context.queryClient
							.ensureQueryData(balancesQueryOptions(address))
							.catch((error) => {
								console.error('Fetch balances error:', error)
								return undefined
							}),
						QUERY_TIMEOUT_MS,
					)
				: Promise.resolve(undefined)

			const [
				contractBytecode,
				transactionsData,
				balancesResult,
				tokenMetadata,
			] = await Promise.all([
				contractBytecodePromise,
				transactionsPromise,
				balancesPromise,
				tokenMetadataPromise,
			])

			const isToken = tokenMetadata !== null && tokenMetadata !== undefined
			// Discard balance results for token addresses to avoid stale/misleading data
			const balancesData = isToken ? undefined : balancesResult

			const accountType = getAccountType(contractBytecode)

			// check if it's a known contract from our registry
			const contractInfo = getContractInfo(address)
			const contractSource: ContractSource | undefined = undefined

			// For SSR, provide placeholder values - client will fetch real data
			const txCountResponse = undefined
			const totalValueResponse = undefined

			return {
				live,
				address,
				page,
				limit,
				offset,
				account,
				accountType,
				isToken,
				tokenMetadata,
				contractInfo,
				contractSource,
				transactionsData,
				balancesData,
				txCountResponse,
				totalValueResponse,
			}
		}),
	head: async ({ params, loaderData }) => {
		const accountType = loaderData?.accountType ?? 'empty'
		const label =
			accountType === 'contract'
				? 'Contract'
				: accountType === 'account'
					? 'Account'
					: 'Address'
		const title = `${label} ${HexFormatter.truncate(params.address as Hex.Hex)} ⋅ Tempo Explorer`

		const txCount = 0

		// Fetch data with a timeout to avoid blocking too long
		let lastActive: string | undefined
		let holdings = '—'

		// Calculate holdings from prefetched balances data
		if (loaderData?.balancesData?.balances) {
			const totalValue = calculateTotalHoldings(
				loaderData.balancesData.balances.map((b) => ({
					address: b.token,
					metadata: {
						decimals: b.decimals,
						currency: b.currency,
					},
					balance: BigInt(b.balance),
				})),
			)
			if (totalValue && totalValue > 0) {
				holdings = PriceFormatter.format(totalValue, { format: 'short' })
			}
		}

		// Get the most recent transaction for lastActive (already in loaderData with timestamp)
		const recentTx = loaderData?.transactionsData?.transactions?.at(0)
		if (recentTx?.timestamp) {
			lastActive = DateFormatter.formatTimestampForOg(
				BigInt(recentTx.timestamp),
			).date
		}

		const description = buildAddressDescription(
			{ holdings, txCount },
			params.address,
		)

		const ogImageUrl = buildAddressOgImageUrl({
			address: params.address,
			holdings,
			txCount,
			accountType,
			lastActive,
		})

		return {
			title,
			meta: [
				{ title },
				{ property: 'og:title', content: title },
				{ property: 'og:description', content: description },
				{ name: 'twitter:description', content: description },
				{ property: 'og:image', content: ogImageUrl },
				{ property: 'og:image:type', content: 'image/webp' },
				{ property: 'og:image:width', content: '1200' },
				{ property: 'og:image:height', content: '630' },
				{ name: 'twitter:card', content: 'summary_large_image' },
				{ name: 'twitter:image', content: ogImageUrl },
			],
		}
	},
})

function RouteComponent() {
	const navigate = useNavigate()
	const router = useRouter()
	const location = useLocation()
	const { address } = Route.useParams()
	const { page, tab, live, limit, a } = Route.useSearch()
	const {
		accountType,
		isToken,
		tokenMetadata,
		account,
		contractInfo,
		contractSource,
		transactionsData,
		balancesData,
	} = Route.useLoaderData()

	Address.assert(address)

	const { data: addressMetadata } = useQuery({
		queryKey: ['address-metadata', address],
		queryFn: () => fetchAddressMetadata(address),
		staleTime: 30_000,
	})

	const hash = location.hash

	// Track which hash we've already redirected for (prevents re-redirect when
	// user manually switches tabs, but allows redirect for new hash values)
	const redirectedForHashRef = React.useRef<string | null>(null)

	const resolvedAccountType = addressMetadata?.accountType ?? accountType

	// When URL has a hash fragment (e.g., #functionName), switch to interact tab
	const isContract = resolvedAccountType === 'contract'

	React.useEffect(() => {
		// Only redirect if:
		// 1. We have a hash
		// 2. Address is a contract
		// 3. Haven't already redirected for this specific hash
		if (!hash || !isContract || redirectedForHashRef.current === hash) return

		// Determine which tab the hash should navigate to
		// TanStack Router's location.hash doesn't include the '#' prefix
		const isSourceFileHash = hash.startsWith('source-file-')
		const targetTab = isSourceFileHash ? 'contract' : 'interact'

		// Only redirect if we're not already on the target tab
		if (tab === targetTab) return

		redirectedForHashRef.current = hash
		navigate({
			to: '.',
			search: { page: 1, tab: targetTab, limit },
			hash,
			replace: true,
			resetScroll: false,
		})
	}, [hash, isContract, tab, navigate, limit])

	React.useEffect(() => {
		// Preload next page for paginated tabs
		if (tab !== 'transactions' && tab !== 'transfers' && tab !== 'holders')
			return
		async function preload() {
			try {
				const nextPage = page + 1
				router.preloadRoute({
					to: '.',
					search: { page: nextPage, tab, limit, ...(a ? { a } : {}) },
				})
			} catch (error) {
				console.error('Preload error (non-blocking):', error)
			}
		}

		preload()
	}, [page, router, tab, limit, a])

	// Build visible tabs based on address type
	const isTip20 = Tip20.isTip20Address(address)
	const visibleTabs: TabValue[] = React.useMemo(() => {
		const tabs: TabValue[] = ['transactions', 'holdings']
		if (isToken) {
			tabs.push('transfers', 'holders')
		}
		if (isTip20) {
			tabs.push('token')
		}
		if (isContract) {
			tabs.push('contract', 'interact')
		}
		return tabs
	}, [isToken, isTip20, isContract])

	const setActiveSection = React.useCallback(
		(newIndex: number) => {
			const newTab = visibleTabs[newIndex] ?? 'transactions'
			navigate({
				to: '.',
				search: { page: 1, tab: newTab, limit, ...(a ? { a } : {}) },
				resetScroll: false,
			})
		},
		[navigate, limit, a, visibleTabs],
	)

	const activeSection =
		visibleTabs.indexOf(tab) !== -1 ? visibleTabs.indexOf(tab) : 0

	const isHoldingsTabActive = tab === 'holdings'

	const { data: assetsData, isLoading: assetsLoading } = useBalancesData(
		address,
		balancesData,
		!isToken && (isHoldingsTabActive || balancesData !== undefined),
	)

	// Prefetch non-active tabs' data once on load for smooth tab switches
	const queryClient = useQueryClient()
	const prefetchedRef = React.useRef<string | null>(null)
	React.useEffect(() => {
		if (prefetchedRef.current === address) return
		prefetchedRef.current = address

		// Prefetch all tabs except the active one (loader already fetched active tab data)
		if (tab !== 'transactions') {
			queryClient.prefetchQuery(
				historyQueryOptions({ address, page: 1, limit, offset: 0 }),
			)
		}
		if (tab !== 'holdings' && !isToken) {
			queryClient.prefetchQuery(balancesQueryOptions(address))
		}
	}, [address, tab, limit, queryClient, isToken])

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-[800px]:pt-10 max-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-3.5 min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-7xl',
			)}
		>
			<BreadcrumbsSlot className="col-span-full" />
			<AccountCardWithTimestamps
				address={address}
				assetsData={assetsData}
				accountType={accountType}
				addressMetadata={addressMetadata}
				isToken={isToken}
				tokenMetadata={tokenMetadata}
			/>
			<SectionsWrapper
				address={address}
				page={page}
				limit={limit}
				activeSection={activeSection}
				onSectionChange={setActiveSection}
				contractInfo={contractInfo}
				contractSource={contractSource}
				initialData={transactionsData}
				assetsData={assetsData}
				assetsLoading={assetsLoading}
				live={live}
				isContract={isContract}
				isToken={isToken}
				tokenMetadata={tokenMetadata}
				account={account}
				visibleTabs={visibleTabs}
			/>
		</div>
	)
}

async function fetchAddressMetadata(address: Address.Address) {
	const response = await fetch(getApiUrl(`/api/address/metadata/${address}`), {
		headers: { 'Content-Type': 'application/json' },
	})
	if (!response.ok) throw new Error('Failed to fetch address metadata')
	return response.json() as Promise<{
		accountType: AccountType
		txCount: number | null
		lastActivityTimestamp: number | null
		createdTimestamp: number | null
	}>
}

type ContractCreationResponse = {
	creation: { blockNumber: string; timestamp: string } | null
	error: string | null
}

async function fetchContractCreation(
	address: Address.Address,
): Promise<ContractCreationResponse> {
	const response = await fetch(`/api/contract/creation/${address}`)
	return response.json() as Promise<ContractCreationResponse>
}

function AccountCardWithTimestamps(props: {
	address: Address.Address
	assetsData: AssetData[]
	accountType?: AccountType
	addressMetadata?: Awaited<ReturnType<typeof fetchAddressMetadata>>
	isToken?: boolean
	tokenMetadata?: TokenMetadata | null
}) {
	const {
		address,
		assetsData,
		accountType: initialAccountType,
		addressMetadata,
		isToken,
		tokenMetadata,
	} = props

	const resolvedAccountType = addressMetadata?.accountType ?? initialAccountType
	const isContract = resolvedAccountType === 'contract'
	const missingCreated = !addressMetadata?.createdTimestamp

	// For contracts without a createdTimestamp from metadata (0-tx contracts),
	// fall back to binary-search contract creation lookup
	const { data: contractCreation } = useQuery({
		queryKey: ['contract-creation', address],
		queryFn: () => fetchContractCreation(address),
		enabled: isContract && missingCreated,
		staleTime: 60_000,
	})

	const createdTimestamp = addressMetadata?.createdTimestamp
		? BigInt(addressMetadata.createdTimestamp)
		: contractCreation?.creation?.timestamp
			? BigInt(contractCreation.creation.timestamp)
			: undefined

	const totalValue = calculateTotalHoldings(assetsData)

	return (
		<AccountCard
			address={address}
			className="self-start"
			createdTimestamp={createdTimestamp}
			lastActivityTimestamp={
				addressMetadata?.lastActivityTimestamp
					? BigInt(addressMetadata.lastActivityTimestamp)
					: undefined
			}
			totalValue={totalValue}
			accountType={resolvedAccountType}
			isToken={isToken}
			tokenName={tokenMetadata?.name}
		/>
	)
}

function SectionsWrapper(props: {
	address: Address.Address
	page: number
	limit: number
	activeSection: number
	onSectionChange: (index: number) => void
	contractInfo: ContractInfo | undefined
	contractSource?: ContractSource | undefined
	initialData: HistoryResponse | undefined
	assetsData: AssetData[]
	assetsLoading: boolean
	live: boolean
	isContract: boolean
	isToken: boolean
	tokenMetadata?: TokenMetadata | null
	account?: Address.Address
	visibleTabs: TabValue[]
}) {
	const {
		address,
		page,
		limit,
		activeSection,
		onSectionChange,
		contractInfo,
		contractSource,
		initialData,
		assetsData,
		assetsLoading,
		live,
		isContract,
		isToken,
		tokenMetadata,
		account,
		visibleTabs,
	} = props
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	// Track hydration to avoid SSR/client mismatch with query data
	const isMounted = useIsMounted()

	const isContractTabActive =
		visibleTabs[activeSection] === 'contract' ||
		visibleTabs[activeSection] === 'interact'
	const isTransactionsTabActive = visibleTabs[activeSection] === 'transactions'
	const isTransfersTabActive = visibleTabs[activeSection] === 'transfers'
	const isHoldersTabActive = visibleTabs[activeSection] === 'holders'

	// Contract source query - fetch on demand when contract tab is active
	// Keeps initial page load light while still enabling ABI/source in the UI
	const contractSourceQuery = useQuery({
		...useContractSourceQueryOptions({ address }),
		initialData: contractSource,
		enabled: isMounted && isContract && isContractTabActive,
	})
	// Use SSR data until mounted to avoid hydration mismatch, then use query data
	const resolvedContractSource = isMounted
		? contractSourceQuery.data
		: contractSource

	const extractedAbiQuery = useQuery({
		queryKey: ['contract-abi', address],
		queryFn: () => extractContractAbi(address),
		staleTime: Number.POSITIVE_INFINITY,
		enabled:
			isMounted &&
			isContract &&
			isContractTabActive &&
			!contractInfo?.abi &&
			!contractSourceQuery.data?.abi,
	})

	const resolvedAbi =
		resolvedContractSource?.abi ?? contractInfo?.abi ?? extractedAbiQuery.data

	// Only auto-refresh on page 1 when transactions tab is active and live=true
	const shouldAutoRefresh = page === 1 && isTransactionsTabActive && live

	// For non-tokens: use enriched history API (fast, server-side)
	// For tokens: use raw transactions API + client-side RPC enrichment
	const historySources: HistorySources[] = ['txs', 'transfers', 'emitted']

	// Non-token: use historyQueryOptions (enriched server-side API)
	const {
		data: historyQueryData,
		isPlaceholderData: isHistoryPlaceholder,
		error: historyError,
	} = useQuery({
		...historyQueryOptions({
			address,
			page,
			limit,
			offset: (page - 1) * limit,
			sources: historySources,
		}),
		initialData: page === 1 && !isToken ? initialData : undefined,
		// Only fetch when transactions tab is active AND not a token
		enabled:
			isMounted &&
			!isToken &&
			(isTransactionsTabActive || initialData !== undefined),
		refetchInterval: shouldAutoRefresh && !isToken ? 4_000 : false,
		refetchOnWindowFocus: shouldAutoRefresh && !isToken,
	})

	// Token: use transactionsQueryOptions (raw transactions, client-side enrichment)
	const {
		data: tokenTxQueryData,
		isPlaceholderData: isTokenTxPlaceholder,
		error: tokenTxError,
	} = useQuery({
		...transactionsQueryOptions({
			address,
			page,
			limit,
			offset: (page - 1) * limit,
		}),
		// Only fetch when transactions tab is active AND is a token
		enabled: isMounted && isToken && isTransactionsTabActive,
		refetchInterval: shouldAutoRefresh && isToken ? 4_000 : false,
		refetchOnWindowFocus: shouldAutoRefresh && isToken,
	})

	// Client-side RPC enrichment for token transactions
	const batchTransactionDataContextValue = useBatchTransactionData(
		(tokenTxQueryData?.transactions ?? []) as Transaction[],
		address,
		isToken && isTransactionsTabActive,
	)

	// Unified data access - pick based on isToken
	const isPlaceholderData = isToken
		? isTokenTxPlaceholder
		: isHistoryPlaceholder
	const error = isToken ? tokenTxError : historyError

	/**
	 * use initialData until mounted to avoid hydration mismatch
	 * (tanstack query may have fresher cached data that differs from SSR)
	 */
	const historyData = isMounted
		? historyQueryData
		: page === 1
			? initialData
			: historyQueryData
	const tokenTxData = isMounted ? tokenTxQueryData : undefined

	// Extract transaction list based on data source
	const transactions = isToken
		? ((tokenTxData?.transactions ?? []) as Transaction[])
		: (historyData?.transactions ?? [])
	const hasMore = isToken
		? (tokenTxData?.hasMore ?? false)
		: (historyData?.hasMore ?? false)
	const total = isToken ? undefined : historyData?.total
	const countCapped = isToken ? false : (historyData?.countCapped ?? false)

	// Token transfers query
	const transfersPage = isTransfersTabActive ? page : 1
	const { data: transfersData, isPlaceholderData: isTransfersPlaceholder } =
		useQuery({
			...transfersQueryOptions({
				address,
				page: transfersPage,
				limit,
				offset: isTransfersTabActive ? (page - 1) * limit : 0,
				account,
			}),
			enabled: isMounted && isToken && isTransfersTabActive,
		})

	const {
		transfers = [],
		total: transfersTotal = 0,
		totalCapped: transfersTotalCapped = false,
	} = transfersData ?? {}

	// Token holders query
	const holdersPage = isHoldersTabActive ? page : 1
	const { data: holdersData, isPlaceholderData: isHoldersPlaceholder } =
		useQuery({
			...holdersQueryOptions({
				address,
				page: holdersPage,
				limit,
				offset: isHoldersTabActive ? (page - 1) * limit : 0,
			}),
			enabled: isMounted && isToken && isHoldersTabActive,
		})

	const {
		holders = [],
		total: holdersTotal = 0,
		totalCapped: holdersTotalCapped = false,
	} = holdersData ?? {}

	// Use total from history API response for display (non-tokens only)
	// Only use after mount AND when data has loaded to avoid showing 0 during loading
	const totalTrxCount = isMounted && !isToken && historyData ? total : undefined

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	// Show error state for API failures (instead of crashing the whole page)
	const transactionsError = error ? (
		<div className="rounded-[10px] bg-card-header p-4.5">
			<p className="text-sm font-medium text-red-400">
				Failed to load transaction history
			</p>
			<p className="text-xs text-tertiary mt-1">
				{error instanceof Error ? error.message : 'Unknown error'}
			</p>
		</div>
	) : null

	const transactionsColumns: DataGrid.Column[] = [
		{
			label: (
				<TimeColumnHeader
					label="Time"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
					className="text-secondary hover:text-accent cursor-pointer transition-colors"
				/>
			),
			align: 'start',
			width: '0.5fr',
		},
		{ label: 'Description', align: 'start', width: '2fr' },
		{ label: 'Hash', align: 'end', width: '1fr' },
		{ label: 'Fee', align: 'end', width: '0.5fr' },
		{ label: 'Total', align: 'end', width: '0.5fr' },
	]

	const transfersColumns: DataGrid.Column[] = [
		{
			label: (
				<TimeColumnHeader
					label="Time"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
					className="text-secondary hover:text-accent cursor-pointer transition-colors"
				/>
			),
			align: 'start',
			minWidth: 100,
		},
		{ label: 'Transaction', align: 'start', minWidth: 120 },
		{ label: 'From', align: 'start', minWidth: 140 },
		{ label: 'To', align: 'start', minWidth: 140 },
		{ label: 'Amount', align: 'end', minWidth: 100 },
	]

	const holdersColumns: DataGrid.Column[] = [
		{ label: 'Address', align: 'start', minWidth: 140 },
		{ label: 'Balance', align: 'end', minWidth: 120 },
		{ label: 'Percentage', align: 'end', minWidth: 100 },
	]

	// Build sections based on visible tabs
	const sections = visibleTabs.map((tabName) => {
		switch (tabName) {
			case 'transactions':
				return {
					title: 'Transactions',
					totalItems: totalTrxCount ?? transactions.length,
					itemsLabel: 'transactions',
					content:
						transactionsError ??
						(isToken ? (
							// Token: use client-side RPC enrichment via context
							<BatchTransactionDataContext.Provider
								value={batchTransactionDataContextValue}
							>
								<DataGrid
									columns={{
										stacked: transactionsColumns,
										tabs: transactionsColumns,
									}}
									items={() =>
										(transactions as Transaction[]).map((transaction) => ({
											cells: [
												<TokenTransactionTimeCell
													key="time"
													hash={transaction.hash as Hex.Hex}
													format={timeFormat}
												/>,
												<TokenTransactionDescCell
													key="desc"
													transaction={transaction}
													accountAddress={address}
												/>,
												<Midcut
													key="hash"
													value={transaction.hash}
													prefix="0x"
													align="end"
												/>,
												<TokenTransactionFeeCell
													key="fee"
													hash={transaction.hash as Hex.Hex}
												/>,
												<TransactionTotal
													key="total"
													transaction={transaction}
												/>,
											],
											link: {
												href: `/receipt/${transaction.hash}`,
												title: `View receipt ${transaction.hash}`,
											},
										}))
									}
									totalItems={transactions.length}
									pages={{ hasMore }}
									page={page}
									fetching={isPlaceholderData}
									loading={!isMounted || !tokenTxData}
									itemsLabel="transactions"
									itemsPerPage={limit}
									pagination="simple"
									emptyState="No transactions found."
								/>
							</BatchTransactionDataContext.Provider>
						) : (
							// Non-token: use enriched history API data
							<DataGrid
								columns={{
									stacked: transactionsColumns,
									tabs: transactionsColumns,
								}}
								items={() =>
									(transactions as EnrichedTransaction[]).map(
										(transaction) => ({
											cells: [
												<TransactionTimeCell
													key="time"
													timestamp={transaction.timestamp}
													hash={transaction.hash}
													format={timeFormat}
												/>,
												<TransactionDescCell
													key="desc"
													transaction={transaction}
													accountAddress={address}
												/>,
												<Midcut
													key="hash"
													value={transaction.hash}
													prefix="0x"
													align="end"
												/>,
												<TransactionFeeCell
													key="fee"
													gasUsed={transaction.gasUsed}
													effectiveGasPrice={transaction.effectiveGasPrice}
												/>,
												<TransactionTotalCell
													key="total"
													transaction={transaction}
												/>,
											],
											link: {
												href: `/receipt/${transaction.hash}`,
												title: `View receipt ${transaction.hash}`,
											},
										}),
									)
								}
								totalItems={totalTrxCount ?? transactions.length}
								pages={
									countCapped || totalTrxCount === undefined
										? { hasMore }
										: undefined
								}
								displayCount={totalTrxCount}
								displayCountCapped={countCapped}
								disableLastPage={countCapped}
								page={page}
								fetching={isPlaceholderData}
								loading={!isMounted || !historyData}
								countLoading={totalTrxCount === undefined}
								itemsLabel="transactions"
								itemsPerPage={limit}
								pagination="simple"
								emptyState="No transactions found."
							/>
						)),
				}
			case 'holdings':
				return {
					title: 'Holdings',
					totalItems: assetsData.length,
					itemsLabel: 'assets',
					content: (
						<DataGrid
							columns={{
								stacked: [
									{ label: 'Name', align: 'start', width: '1fr' },
									{ label: 'Contract', align: 'start', width: '1fr' },
									{ label: 'Amount', align: 'end', width: '0.5fr' },
								],
								tabs: [
									{ label: 'Name', align: 'start', width: '1fr' },
									{ label: 'Ticker', align: 'start', width: '0.5fr' },
									{ label: 'Currency', align: 'start', width: '0.5fr' },
									{ label: 'Amount', align: 'end', width: '0.5fr' },
									{ label: 'Value', align: 'end', width: '0.5fr' },
								],
							}}
							items={(mode) =>
								assetsData
									.slice((page - 1) * ASSETS_PER_PAGE, page * ASSETS_PER_PAGE)
									.map((asset) => ({
										className: 'text-[13px]',
										cells:
											mode === 'stacked'
												? [
														<AssetName key="name" asset={asset} />,
														<AssetContract key="contract" asset={asset} />,
														<AssetAmount key="amount" asset={asset} />,
													]
												: [
														<AssetName key="name" asset={asset} />,
														<AssetSymbol key="symbol" asset={asset} />,
														<AssetCurrency key="currency" asset={asset} />,
														<AssetAmount key="amount" asset={asset} />,
														<AssetValue key="value" asset={asset} />,
													],
										link: {
											href: `/address/${asset.address}?tab=transfers` as const,
											search: { a: address },
											title: `View token ${asset.address}`,
										},
									}))
							}
							totalItems={assetsData.length}
							page={page}
							itemsLabel="assets"
							itemsPerPage={ASSETS_PER_PAGE}
							pagination="simple"
							loading={assetsLoading}
							emptyState="No assets found."
						/>
					),
				}
			case 'transfers':
				return {
					title: 'Transfers',
					totalItems:
						transfersData && (transfersTotalCapped ? '100k+' : transfersTotal),
					itemsLabel: 'transfers',
					contextual: account && (
						<FilterIndicator account={account} tokenAddress={address} />
					),
					content: (
						<DataGrid
							columns={{
								stacked: transfersColumns,
								tabs: transfersColumns,
							}}
							items={() => {
								const validTransfers = transfers.filter(
									(t): t is typeof t & { timestamp: string; value: string } =>
										t.timestamp !== null && t.value !== null,
								)

								return validTransfers.map((transfer) => ({
									cells: [
										<TimestampCell
											key="time"
											timestamp={BigInt(transfer.timestamp)}
											link={`/receipt/${transfer.transactionHash}`}
											format={timeFormat}
										/>,
										<TransactionCell
											key="tx"
											hash={transfer.transactionHash}
										/>,
										<AddressCell
											key="from"
											address={transfer.from}
											label="From"
										/>,
										<AddressCell key="to" address={transfer.to} label="To" />,
										<AmountCell
											key="amount"
											value={BigInt(transfer.value)}
											decimals={tokenMetadata?.decimals}
											symbol={tokenMetadata?.symbol}
										/>,
									],
									link: {
										href: `/receipt/${transfer.transactionHash}`,
										title: `View receipt ${transfer.transactionHash}`,
									},
								}))
							}}
							totalItems={transfersTotal}
							displayCount={transfersTotal}
							displayCountCapped={transfersTotalCapped}
							page={page}
							fetching={isTransfersPlaceholder}
							loading={!transfersData}
							itemsLabel="transfers"
							itemsPerPage={limit}
							pagination="simple"
							emptyState="No transfers found."
						/>
					),
				}
			case 'holders':
				return {
					title: 'Holders',
					totalItems:
						holdersData && (holdersTotalCapped ? '100k+' : holdersTotal),
					itemsLabel: 'holders',
					content: (
						<DataGrid
							columns={{
								stacked: holdersColumns,
								tabs: holdersColumns,
							}}
							items={() =>
								holders.map((holder) => {
									const percentage =
										tokenMetadata?.totalSupply && tokenMetadata.totalSupply > 0n
											? Number(
													(BigInt(holder.balance) * 10_000n) /
														tokenMetadata.totalSupply,
												) / 100
											: 0
									return {
										cells: [
											<AddressCell key="address" address={holder.address} />,
											<BalanceCell
												key="balance"
												balance={holder.balance}
												decimals={tokenMetadata?.decimals}
											/>,
											<span
												key="percentage"
												className="text-[12px] text-primary"
											>
												{percentage.toFixed(2)}%
											</span>,
										],
										link: {
											href: `/address/${address}?tab=transfers&a=${holder.address}`,
											title: `View transfers for ${holder.address}`,
										},
									}
								})
							}
							totalItems={holdersTotal}
							displayCount={holdersTotal}
							displayCountCapped={holdersTotalCapped}
							page={page}
							fetching={isHoldersPlaceholder}
							loading={!holdersData}
							itemsLabel="holders"
							itemsPerPage={limit}
							pagination="simple"
							emptyState="No holders found."
						/>
					),
				}
			case 'token':
				return {
					title: 'Token',
					totalItems: 0,
					itemsLabel: 'items',
					content: <Tip20TokenTabContent address={address} />,
				}
			case 'contract':
				return {
					title: 'Contract',
					totalItems: 0,
					itemsLabel: 'items',
					content: (
						<ContractTabContent
							address={address}
							abi={resolvedAbi}
							docsUrl={contractInfo?.docsUrl}
							source={resolvedContractSource}
						/>
					),
				}
			case 'interact':
				return {
					title: 'Interact',
					totalItems: 0,
					itemsLabel: 'functions',
					content: (
						<InteractTabContent
							address={address}
							abi={resolvedAbi}
							docsUrl={contractInfo?.docsUrl}
						/>
					),
				}
			default:
				return {
					title: 'Unknown',
					totalItems: 0,
					itemsLabel: 'items',
					content: null,
				}
		}
	})

	return (
		<Sections
			mode={mode}
			sections={sections}
			activeSection={activeSection}
			onSectionChange={onSectionChange}
		/>
	)
}

function TransactionTimeCell(props: {
	timestamp: number
	hash: Hex.Hex
	format: TimeFormat
}) {
	const { timestamp, hash, format } = props
	return (
		<TransactionTimestamp
			timestamp={BigInt(timestamp)}
			link={`/receipt/${hash}`}
			format={format}
		/>
	)
}

function TransactionDescCell(props: {
	transaction: EnrichedTransaction
	accountAddress: Address.Address
}) {
	const { transaction, accountAddress } = props
	if (!transaction.knownEvents.length) {
		return <span className="text-secondary">No events</span>
	}
	return (
		<TransactionDescription
			transaction={
				transaction as unknown as Parameters<
					typeof TransactionDescription
				>[0]['transaction']
			}
			knownEvents={transaction.knownEvents}
			transactionReceipt={undefined}
			accountAddress={accountAddress}
		/>
	)
}

function TransactionFeeCell(props: {
	gasUsed: string
	effectiveGasPrice: string
}) {
	const fee =
		Hex.toBigInt(props.gasUsed as Hex.Hex) *
		Hex.toBigInt(props.effectiveGasPrice as Hex.Hex)
	return (
		<span className="text-tertiary">
			{PriceFormatter.format(fee, { decimals: 18, format: 'short' })}
		</span>
	)
}

function TransactionTotalCell(props: { transaction: EnrichedTransaction }) {
	const { transaction } = props

	const amountParts = React.useMemo(() => {
		return transaction.knownEvents
			.filter((event) => event.type !== 'approval')
			.flatMap((event) =>
				event.parts.filter(
					(part): part is Extract<KnownEventPart, { type: 'amount' }> =>
						part.type === 'amount',
				),
			)
	}, [transaction.knownEvents])

	const infiniteLabel = <span className="text-secondary">−</span>

	if (!amountParts.length)
		return (
			<Amount.Base
				value={0n}
				decimals={0}
				prefix="$"
				short
				infinite={infiniteLabel}
			/>
		)

	const normalizedDecimals = 18
	const totalValue = amountParts.reduce((sum, part) => {
		const decimals = part.value.decimals ?? 6
		const scale = 10n ** BigInt(normalizedDecimals - decimals)
		const value =
			typeof part.value.value === 'bigint'
				? part.value.value
				: BigInt(part.value.value)
		return sum + value * scale
	}, 0n)

	if (totalValue === 0n) {
		const value = transaction.value
			? Hex.toBigInt(transaction.value as Hex.Hex)
			: 0n
		if (value === 0n) return <span className="text-tertiary">—</span>
		return (
			<Amount.Base
				value={value}
				decimals={18}
				infinite={infiniteLabel}
				prefix="$"
				short
			/>
		)
	}

	return (
		<Amount.Base
			value={totalValue}
			decimals={normalizedDecimals}
			infinite={infiniteLabel}
			prefix="$"
			short
		/>
	)
}

// Token-specific cell components that use batch data context
function TokenTransactionTimeCell(props: {
	hash: Hex.Hex
	format: TimeFormat
}) {
	const { hash, format } = props
	const batchData = useTransactionDataFromBatch(hash)
	if (!batchData?.block?.timestamp) {
		return <span className="text-tertiary">…</span>
	}
	return (
		<TransactionTimestamp
			timestamp={batchData.block.timestamp}
			link={`/receipt/${hash}`}
			format={format}
		/>
	)
}

function TokenTransactionDescCell(props: {
	transaction: Transaction
	accountAddress: Address.Address
}) {
	const { transaction, accountAddress } = props
	const batchData = useTransactionDataFromBatch(transaction.hash as Hex.Hex)
	if (!batchData?.knownEvents?.length) {
		return <span className="text-secondary">…</span>
	}
	return (
		<TransactionDescription
			transaction={transaction}
			knownEvents={batchData.knownEvents}
			transactionReceipt={batchData.receipt}
			accountAddress={accountAddress}
		/>
	)
}

function TokenTransactionFeeCell(props: { hash: Hex.Hex }) {
	const batchData = useTransactionDataFromBatch(props.hash)
	if (!batchData?.receipt) {
		return <span className="text-tertiary">…</span>
	}
	const fee = batchData.receipt.gasUsed * batchData.receipt.effectiveGasPrice
	return (
		<span className="text-tertiary">
			{PriceFormatter.format(fee, { decimals: 18, format: 'short' })}
		</span>
	)
}

function AssetName(props: { asset: AssetData }) {
	const { asset } = props
	if (!asset.metadata?.name) return <span className="text-tertiary">…</span>
	return (
		<span className="inline-flex items-center gap-2">
			<TokenIcon
				address={asset.address}
				name={asset.metadata?.name}
				className="size-5!"
			/>
			<span className="truncate">{asset.metadata.name}</span>
		</span>
	)
}

function AssetSymbol(props: { asset: AssetData }) {
	const { asset } = props
	if (!asset.metadata?.symbol) return <span className="text-tertiary">…</span>
	return (
		<Link
			to="/token/$address"
			params={{ address: asset.address }}
			className="text-accent hover:underline press-down"
		>
			{asset.metadata.symbol}
		</Link>
	)
}

function AssetContract(props: { asset: AssetData }) {
	return (
		<span className="text-accent">
			{HexFormatter.truncate(props.asset.address, 10)}
		</span>
	)
}

function AssetCurrency(props: { asset: AssetData }) {
	const { asset } = props
	if (!asset.metadata?.currency) return <span className="text-tertiary">—</span>
	return <span>{asset.metadata.currency}</span>
}

function AssetAmount(props: { asset: AssetData }) {
	const { asset } = props
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span className="text-tertiary">…</span>
	const formatted = formatUnits(asset.balance, asset.metadata.decimals)
	return <span>{PriceFormatter.formatAmountFull(formatted)}</span>
}

function AssetValue(props: { asset: AssetData }) {
	const { asset } = props
	if (asset.metadata?.currency !== 'USD')
		return <span className="text-tertiary">—</span>
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span className="text-tertiary">…</span>
	return (
		<span>
			{PriceFormatter.format(asset.balance, {
				decimals: asset.metadata.decimals,
				format: 'short',
			})}
		</span>
	)
}

function FilterIndicator(props: {
	account: Address.Address
	tokenAddress: Address.Address
}) {
	const { account, tokenAddress } = props
	return (
		<div className="flex items-center gap-2 text-[12px]">
			<span className="text-tertiary">Filtered:</span>
			<Link
				to="/address/$address"
				params={{ address: account }}
				className="text-accent press-down font-mono"
				title={account}
			>
				<Midcut value={account} prefix="0x" />
			</Link>
			<Link
				to="/address/$address"
				params={{ address: tokenAddress }}
				search={{ tab: 'transfers' }}
				className="text-tertiary press-down"
				title="Clear filter"
			>
				<XIcon className="size-3.5 translate-y-px" />
			</Link>
		</div>
	)
}
