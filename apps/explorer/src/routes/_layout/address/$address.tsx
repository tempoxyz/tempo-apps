import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	ClientOnly,
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
import { type GetBlockReturnType, getBlock } from 'wagmi/actions'
import * as z from 'zod/mini'
import { AccountCard } from '#comps/AccountCard'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { ContractTabContent, InteractTabContent } from '#comps/Contract'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import {
	TimeColumnHeader,
	type TimeFormat,
	useTimeFormat,
} from '#comps/TimeFormat'
import { TokenIcon } from '#comps/TokenIcon'
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
import * as Tip20 from '#lib/domain/tip20'
import { DateFormatter, HexFormatter, PriceFormatter } from '#lib/formatting'
import { useIsMounted, useMediaQuery } from '#lib/hooks'
import { buildAddressDescription, buildAddressOgImageUrl } from '#lib/og'
import { withLoaderTiming } from '#lib/profiling'
import {
	type TransactionsData,
	transactionsQueryOptions,
} from '#lib/queries/account'
import { getWagmiConfig } from '#wagmi.config.ts'
import { getApiUrl } from '#lib/env.ts'

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

	const queries = useQueries({
		queries: hashes.map((hash) => ({
			queryKey: ['tx-data-batch', viewer, hash],
			queryFn: async (): Promise<TransactionData | null> => {
				const receipt = await client.getTransactionReceipt({ hash })
				// TODO: investigate & consider batch/multicall
				const [block, transaction, getTokenMetadata] = await Promise.all([
					client.getBlock({ blockHash: receipt.blockHash }),
					client.getTransaction({ hash: receipt.transactionHash }),
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
			enabled: enabled && hashes.length > 0,
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

	const isLoading = enabled && queries.some((q) => q.isLoading)

	return { transactionDataMap, isLoading }
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
	tab: 'history',
} as const

const ASSETS_PER_PAGE = 10

const TabSchema = z.prefault(
	z.enum(['history', 'assets', 'contract', 'interact']),
	defaultSearchValues.tab,
)

type TabValue = z.infer<typeof TabSchema>

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
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loaderDeps: ({ search: { page, limit, live, tab } }) => ({
		page,
		limit,
		live,
		tab,
	}),
	loader: ({ deps: { page, limit, live, tab }, params, context }) =>
		withLoaderTiming('/_layout/address/$address', async () => {
			const { address } = params
			// Only throw notFound for truly invalid addresses
			if (!Address.validate(address))
				throw notFound({
					routeId: rootRouteId,
					data: { error: 'Invalid address format' },
				})

			const offset = (page - 1) * limit

			// Tab-aware loading: only fetch data needed for the active tab
			const isHistoryTab = tab === 'history'
			const isAssetsTab = tab === 'assets'

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

			// Always fetch bytecode (needed for account type detection)
			const contractBytecodePromise = timeout(
				getContractBytecode(address).catch((error) => {
					console.error('[loader] Failed to get bytecode:', error)
					return undefined
				}),
				QUERY_TIMEOUT_MS,
			)

			// Only block on transactions if history tab is active
			const transactionsPromise = isHistoryTab
				? timeout(
						context.queryClient
							.ensureQueryData(
								transactionsQueryOptions({
									address,
									page,
									limit,
									offset,
								}),
							)
							.catch((error) => {
								console.error('Fetch transactions error:', error)
								return undefined
							}),
						QUERY_TIMEOUT_MS,
					)
				: Promise.resolve(undefined)

			// Fire off optional loaders without blocking page render
			// These will populate the cache if successful but won't delay the page load
			context.queryClient
				.ensureQueryData({
					queryKey: ['account-total-value', address],
					queryFn: () => fetchAddressTotalValue(address),
					staleTime: 60_000,
				})
				.catch((error) => {
					console.error('Fetch total-value error (non-blocking):', error)
				})

			// Only block on balances if assets tab is active
			const balancesPromise = isAssetsTab
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

			const [contractBytecode, transactionsData, balancesData] =
				await Promise.all([
					contractBytecodePromise,
					transactionsPromise,
					balancesPromise,
				])

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
				accountType,
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

		const TIMEOUT_MS = 500
		const timeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
			Promise.race([
				promise,
				new Promise<null>((r) => setTimeout(() => r(null), ms)),
			])

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

		try {
			const config = getWagmiConfig()
			// Get the most recent transaction for lastActive (already in loaderData)
			const recentTx = loaderData?.transactionsData?.transactions?.at(0)
			if (recentTx?.blockNumber) {
				const recentBlock = await timeout(
					getBlock(config, { blockNumber: Hex.toBigInt(recentTx.blockNumber) }),
					TIMEOUT_MS,
				)
				if (recentBlock) {
					lastActive = DateFormatter.formatTimestampForOg(
						recentBlock.timestamp,
					).date
				}
			}
		} catch {
			// Ignore errors, lastActive will be undefined
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
	const { page, tab, live, limit } = Route.useSearch()
	const {
		accountType,
		contractInfo,
		contractSource,
		transactionsData,
		balancesData,
	} = Route.useLoaderData()

	Address.assert(address)

	const { data: metadata } = useQuery({
		queryKey: ['address-metadata', address],
		queryFn: () => fetchAddressMetadata(address),
		staleTime: 30_000,
	})

	const hash = location.hash

	// Track which hash we've already redirected for (prevents re-redirect when
	// user manually switches tabs, but allows redirect for new hash values)
	const redirectedForHashRef = React.useRef<string | null>(null)

	const resolvedAccountType = metadata?.accountType ?? accountType

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
		// Only preload for history tab (transaction pagination)
		if (tab !== 'history') return
		// preload next page only to reduce initial load overhead
		async function preload() {
			try {
				const nextPage = page + 1
				router.preloadRoute({
					to: '.',
					search: { page: nextPage, tab, limit },
				})
			} catch (error) {
				console.error('Preload error (non-blocking):', error)
			}
		}

		preload()
	}, [page, router, tab, limit])

	const setActiveSection = React.useCallback(
		(newIndex: number) => {
			const tabs: TabValue[] = ['history', 'assets', 'contract', 'interact']

			const newTab = tabs[newIndex] ?? 'history'
			navigate({
				to: '.',
				search: { page, tab: newTab, limit },
				resetScroll: false,
			})
		},
		[navigate, page, limit],
	)

	const activeSection =
		tab === 'history'
			? 0
			: tab === 'assets'
				? 1
				: tab === 'contract'
					? 2
					: tab === 'interact'
						? 3
						: 0

	const isAssetsTabActive = activeSection === 1

	const { data: assetsData, isLoading: assetsLoading } = useBalancesData(
		address,
		balancesData,
		isAssetsTabActive || balancesData !== undefined,
	)

	// Prefetch non-active tabs' data once on load for smooth tab switches
	const queryClient = useQueryClient()
	const prefetchedRef = React.useRef<string | null>(null)
	React.useEffect(() => {
		if (prefetchedRef.current === address) return
		prefetchedRef.current = address

		// Prefetch all tabs except the active one (loader already fetched active tab data)
		if (tab !== 'history') {
			queryClient.prefetchQuery(
				transactionsQueryOptions({ address, page: 1, limit, offset: 0 }),
			)
		}
		if (tab !== 'assets') {
			queryClient.prefetchQuery(balancesQueryOptions(address))
		}
	}, [address, tab, limit, queryClient])

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-3.5 min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-7xl',
			)}
		>
			<BreadcrumbsSlot className="col-span-full" />
			<AccountCardWithTimestamps
				address={address}
				assetsData={assetsData}
				accountType={accountType}
				metadata={metadata}
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
				metadata={metadata}
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

function AccountCardWithTimestamps(props: {
	address: Address.Address
	assetsData: AssetData[]
	accountType?: AccountType
	metadata?: Awaited<ReturnType<typeof fetchAddressMetadata>>
}) {
	const {
		address,
		assetsData,
		accountType: initialAccountType,
		metadata,
	} = props

	const totalValue = calculateTotalHoldings(assetsData)

	return (
		<AccountCard
			address={address}
			className="self-start"
			createdTimestamp={
				metadata?.createdTimestamp
					? BigInt(metadata.createdTimestamp)
					: undefined
			}
			lastActivityTimestamp={
				metadata?.lastActivityTimestamp
					? BigInt(metadata.lastActivityTimestamp)
					: undefined
			}
			totalValue={totalValue}
			accountType={metadata?.accountType ?? initialAccountType}
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
	initialData: TransactionsData | undefined
	assetsData: AssetData[]
	assetsLoading: boolean
	live: boolean
	isContract: boolean
	metadata?: Awaited<ReturnType<typeof fetchAddressMetadata>>
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
		metadata,
	} = props
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	// Track hydration to avoid SSR/client mismatch with query data
	const isMounted = useIsMounted()

	const isContractTabActive = activeSection === 2 || activeSection === 3

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

	const isHistoryTabActive = activeSection === 0
	// Only auto-refresh on page 1 when history tab is active and live=true
	const shouldAutoRefresh = page === 1 && isHistoryTabActive && live

	const {
		data: queryData,
		isPlaceholderData,
		error,
	} = useQuery({
		...transactionsQueryOptions({
			address,
			page,
			limit,
			offset: (page - 1) * limit,
		}),
		initialData: page === 1 ? initialData : undefined,
		// Only fetch transactions when history tab is active (or we have SSR data)
		enabled: isMounted && (isHistoryTabActive || initialData !== undefined),
		// Override refetch settings reactively based on tab state
		refetchInterval: shouldAutoRefresh ? 4_000 : false,
		refetchOnWindowFocus: shouldAutoRefresh,
	})

	/**
	 * use initialData until mounted to avoid hydration mismatch
	 * (tanstack query may have fresher cached data that differs from SSR)
	 */
	const data = isMounted ? queryData : page === 1 ? initialData : queryData
	const { transactions = [], hasMore = false } = data ?? {}

	const batchTransactionDataContextValue = useBatchTransactionData(
		transactions,
		address,
		isHistoryTabActive,
	)

	// Exact count from dedicated API endpoint (for display only)
	// metadata txCount counts "from OR to" while pagination API only serves a subset,
	// so we can't use exactCount for page calculation - most pages would be empty
	// Only use after mount to avoid SSR/client hydration mismatch
	const exactCount = isMounted ? (metadata?.txCount ?? undefined) : undefined

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	// Show error state for API failures (instead of crashing the whole page)
	const historyError = error ? (
		<div className="rounded-[10px] bg-card-header p-4.5">
			<p className="text-sm font-medium text-red-400">
				Failed to load transaction history
			</p>
			<p className="text-xs text-tertiary mt-1">
				{error instanceof Error ? error.message : 'Unknown error'}
			</p>
		</div>
	) : null

	const historyColumns: DataGrid.Column[] = [
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

	return (
		<BatchTransactionDataContext.Provider
			value={batchTransactionDataContextValue}
		>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'History',
						totalItems: data && exactCount,
						itemsLabel: 'transactions',
						content: historyError ?? (
							<DataGrid
								columns={{
									stacked: historyColumns,
									tabs: historyColumns,
								}}
								items={() =>
									transactions.map((transaction) => ({
										cells: [
											<TransactionTimeCell
												key="time"
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
											<TransactionFeeCell key="fee" hash={transaction.hash} />,
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
								totalItems={exactCount ?? transactions.length}
								pages={exactCount === undefined ? { hasMore } : undefined}
								displayCount={exactCount}
								page={page}
								fetching={isPlaceholderData}
								loading={!data}
								countLoading={exactCount === undefined}
								itemsLabel="transactions"
								itemsPerPage={limit}
								pagination="simple"
								emptyState="No transactions found."
							/>
						),
					},
					{
						title: 'Assets',
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
												href: `/token/${asset.address}` as const,
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
					},
					// Contract tab - ABI + Source Code (always shown, disabled when no data)
					{
						title: 'Contract',
						totalItems: 0,
						itemsLabel: 'items',
						visible: isContract,
						content: (
							<ContractTabContent
								address={address}
								abi={resolvedAbi}
								docsUrl={contractInfo?.docsUrl}
								source={resolvedContractSource}
							/>
						),
					},
					// Interact tab - Read + Write contract (always shown, disabled when no data)
					{
						title: 'Interact',
						totalItems: 0,
						itemsLabel: 'functions',
						visible: isContract,
						content: (
							<InteractTabContent
								address={address}
								abi={resolvedAbi}
								docsUrl={contractInfo?.docsUrl}
							/>
						),
					},
				]}
				activeSection={activeSection}
				onSectionChange={onSectionChange}
			/>
		</BatchTransactionDataContext.Provider>
	)
}

const placeholder = <span className="text-tertiary">—</span>

function TransactionTimeCell(props: { hash: Hex.Hex; format: TimeFormat }) {
	return (
		<ClientOnly fallback={placeholder}>
			<TransactionTimeCellInner {...props} />
		</ClientOnly>
	)
}

function TransactionTimeCellInner(props: {
	hash: Hex.Hex
	format: TimeFormat
}) {
	const { hash, format } = props
	const batchData = useTransactionDataFromBatch(hash)
	if (!batchData?.block) return placeholder
	return (
		<TransactionTimestamp
			timestamp={batchData.block.timestamp}
			link={`/receipt/${hash}`}
			format={format}
		/>
	)
}

function TransactionDescCell(props: {
	transaction: Transaction
	accountAddress: Address.Address
}) {
	return (
		<ClientOnly fallback={placeholder}>
			<TransactionDescCellInner {...props} />
		</ClientOnly>
	)
}

function TransactionDescCellInner(props: {
	transaction: Transaction
	accountAddress: Address.Address
}) {
	const { transaction, accountAddress } = props
	const batchData = useTransactionDataFromBatch(transaction.hash)
	if (!batchData) return placeholder
	if (!batchData.knownEvents.length) {
		const count = batchData.receipt?.logs.length ?? 0
		return (
			<span className="text-secondary">
				{count === 0 ? 'No events' : `${count} events`}
			</span>
		)
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

function TransactionFeeCell(props: { hash: Hex.Hex }) {
	return (
		<ClientOnly fallback={placeholder}>
			<TransactionFeeCellInner {...props} />
		</ClientOnly>
	)
}

function TransactionFeeCellInner(props: { hash: Hex.Hex }) {
	const batchData = useTransactionDataFromBatch(props.hash)
	if (!batchData?.receipt) return placeholder
	return (
		<span className="text-tertiary">
			{PriceFormatter.format(
				batchData.receipt.effectiveGasPrice * batchData.receipt.gasUsed,
				{ decimals: 18, format: 'short' },
			)}
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
