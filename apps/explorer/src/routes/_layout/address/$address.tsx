import { useQueries, useQuery } from '@tanstack/react-query'
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
import { Address, Hex } from 'ox'
import * as React from 'react'
import { Hooks } from 'tempo.ts/wagmi'
import { formatUnits, isHash, type RpcTransaction as Transaction } from 'viem'
import { Abis } from 'viem/tempo'
import { useBlock, useChainId, usePublicClient } from 'wagmi'
import {
	type GetBlockReturnType,
	getBlock,
	getChainId,
	readContract,
} from 'wagmi/actions'
import * as z from 'zod/mini'
import { AccountCard } from '#comps/AccountCard'
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
import { cx } from '#cva.config'
import { type AccountType, getAccountType } from '#lib/account'
import {
	type ContractSource,
	contractSourceQueryOptions,
	fetchContractSourceDirect,
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
import {
	type TransactionsData,
	transactionsQueryOptions,
} from '#lib/queries/account'
import { getWagmiConfig } from '#wagmi.config.ts'

async function fetchAddressTotalValue(address: Address.Address) {
	const response = await fetch(
		`${__BASE_URL__}/api/address/total-value/${address}`,
		{ headers: { 'Content-Type': 'application/json' } },
	)
	return response.json() as Promise<{ totalValue: number }>
}

async function fetchAddressTotalCount(address: Address.Address) {
	const response = await fetch(
		`${__BASE_URL__}/api/address/txs-count/${address}`,
		{ headers: { 'Content-Type': 'application/json' } },
	)
	if (!response.ok) throw new Error('Failed to fetch total transaction count')
	const {
		data: safeData,
		success,
		error,
	} = z.safeParse(
		z.object({ data: z.number(), error: z.nullable(z.string()) }),
		await response.json(),
	)
	if (!success) throw new Error(z.prettifyError(error))
	return safeData
}

function useBatchTransactionData(
	transactions: Transaction[],
	viewer: Address.Address,
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
			enabled: hashes.length > 0,
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

	const isLoading = queries.some((q) => q.isLoading)

	return { transactionDataMap, isLoading }
}

const assets = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c0000000000000000000000000000000000001',
	'0x20c0000000000000000000000000000000000002',
	'0x20c0000000000000000000000000000000000003',
] as const

type AssetData = {
	address: Address.Address
	metadata: { name?: string; symbol?: string; decimals?: number } | undefined
	balance: bigint | undefined
}

function useAssetsData(accountAddress: Address.Address): AssetData[] {
	// Track hydration to avoid SSR/client mismatch with cached query data
	const isMounted = useIsMounted()

	const meta0 = Hooks.token.useGetMetadata({ token: assets[0] })
	const meta1 = Hooks.token.useGetMetadata({ token: assets[1] })
	const meta2 = Hooks.token.useGetMetadata({ token: assets[2] })
	const meta3 = Hooks.token.useGetMetadata({ token: assets[3] })

	const bal0 = Hooks.token.useGetBalance({
		token: assets[0],
		account: accountAddress,
	})
	const bal1 = Hooks.token.useGetBalance({
		token: assets[1],
		account: accountAddress,
	})
	const bal2 = Hooks.token.useGetBalance({
		token: assets[2],
		account: accountAddress,
	})
	const bal3 = Hooks.token.useGetBalance({
		token: assets[3],
		account: accountAddress,
	})

	return React.useMemo(
		() => [
			{
				address: assets[0],
				metadata: isMounted ? meta0.data : undefined,
				balance: isMounted ? bal0.data : undefined,
			},
			{
				address: assets[1],
				metadata: isMounted ? meta1.data : undefined,
				balance: isMounted ? bal1.data : undefined,
			},
			{
				address: assets[2],
				metadata: isMounted ? meta2.data : undefined,
				balance: isMounted ? bal2.data : undefined,
			},
			{
				address: assets[3],
				metadata: isMounted ? meta3.data : undefined,
				balance: isMounted ? bal3.data : undefined,
			},
		],
		[
			isMounted,
			meta0.data,
			meta1.data,
			meta2.data,
			meta3.data,
			bal0.data,
			bal1.data,
			bal2.data,
			bal3.data,
		],
	)
}

function calculateTotalHoldings(assetsData: AssetData[]): number | undefined {
	const PRICE_PER_TOKEN = 1
	let total: number | undefined
	for (const asset of assetsData) {
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
	loaderDeps: ({ search: { page, limit, live } }) => ({ page, limit, live }),
	loader: async ({ deps: { page, limit, live }, params, context }) => {
		const { address } = params
		// Only throw notFound for truly invalid addresses
		if (!Address.validate(address))
			throw notFound({
				routeId: rootRouteId,
				data: { error: 'Invalid address format' },
			})

		const offset = (page - 1) * limit
		const config = getWagmiConfig()
		const chainId = getChainId(config)

		// Get bytecode to determine account type
		const contractBytecode = await getContractBytecode(address).catch(
			(error) => {
				console.error('[loader] Failed to get bytecode:', error)
				return undefined
			},
		)

		const accountType = getAccountType(contractBytecode)

		// check if it's a known contract from our registry
		let contractInfo = getContractInfo(address)

		// Only try to extract ABI/fetch source for actual contracts
		let contractSource: ContractSource | undefined
		if (accountType === 'contract') {
			// if not in registry, try to extract ABI from bytecode using whatsabi
			if (!contractInfo && contractBytecode) {
				const contractAbi = await extractContractAbi(address).catch(
					() => undefined,
				)

				if (contractAbi) {
					contractInfo = {
						name: 'Unknown Contract',
						description: 'ABI extracted from bytecode',
						code: contractBytecode,
						abi: contractAbi,
						category: 'utility',
						address,
					}
				}
			}

			// Try to fetch verified contract source if there's bytecode on chain
			// Fetch directly from upstream API (bypasses __BASE_URL__ issues during SSR)
			// Then seed the query cache for client-side hydration
			contractSource = await fetchContractSourceDirect({
				address,
				chainId,
			}).catch((error) => {
				console.error('[loader] Failed to load contract source:', error)
				return undefined
			})
			// Seed the query cache so client hydrates with data already available
			if (contractSource) {
				context.queryClient.setQueryData(
					contractSourceQueryOptions({ address, chainId }).queryKey,
					contractSource,
				)
			}
		}

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

		const transactionsData = await timeout(
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
			txCountResponse,
			totalValueResponse,
		}
	},
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

		try {
			// Fetch holdings by directly reading balances from known tokens
			const accountAddress = params.address as Address.Address

			const config = getWagmiConfig()
			const tokenResults = await timeout(
				// TODO: investigate & consider batch/multicall
				Promise.all(
					assets.map(async (tokenAddress) => {
						try {
							// TODO: investigate & consider batch/multicall
							const [balance, decimals] = await Promise.all([
								readContract(config, {
									address: tokenAddress,
									abi: Abis.tip20,
									functionName: 'balanceOf',
									args: [accountAddress],
								}),
								readContract(config, {
									address: tokenAddress,
									abi: Abis.tip20,
									functionName: 'decimals',
								}),
							])
							return { balance, decimals }
						} catch {
							return null
						}
					}),
				),
				TIMEOUT_MS,
			)

			if (tokenResults) {
				const PRICE_PER_TOKEN = 1
				let totalValue = 0
				for (const result of tokenResults) {
					if (result && result.balance > 0n) {
						totalValue +=
							Number(formatUnits(result.balance, result.decimals)) *
							PRICE_PER_TOKEN
					}
				}
				if (totalValue > 0) {
					holdings = PriceFormatter.format(totalValue, { format: 'short' })
				}
			}
		} catch {
			// Ignore errors, holdings will be '—'
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
				{ property: 'og:image:type', content: 'image/png' },
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
	const { accountType, contractInfo, contractSource, transactionsData } =
		Route.useLoaderData()

	Address.assert(address)

	const hash = location.hash

	// Track which hash we've already redirected for (prevents re-redirect when
	// user manually switches tabs, but allows redirect for new hash values)
	const redirectedForHashRef = React.useRef<string | null>(null)

	// When URL has a hash fragment (e.g., #functionName), switch to interact tab
	const isContract = accountType === 'contract'

	React.useEffect(() => {
		// Only redirect if:
		// 1. We have a hash
		// 2. Address is a contract
		// 3. Not already on interact tab
		// 4. Haven't already redirected for this specific hash
		if (
			hash &&
			isContract &&
			tab !== 'interact' &&
			redirectedForHashRef.current !== hash
		) {
			redirectedForHashRef.current = hash
			navigate({
				to: '.',
				search: { page: 1, tab: 'interact', limit },
				hash,
				replace: true,
				resetScroll: false,
			})
		}
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

	const assetsData = useAssetsData(address)

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-3.5 min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-7xl',
			)}
		>
			<AccountCardWithTimestamps
				address={address}
				assetsData={assetsData}
				accountType={accountType}
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
				live={live}
			/>
		</div>
	)
}

function AccountCardWithTimestamps(props: {
	address: Address.Address
	assetsData: AssetData[]
	accountType?: AccountType
}) {
	const { address, assetsData, accountType } = props

	// fetch the most recent transactions (pg.1)
	const { data: recentData } = useQuery(
		transactionsQueryOptions({
			address,
			page: 1,
			limit: 1,
			offset: 0,
			_key: 'account-creation',
		}),
	)

	// get the 1st (most recent) transaction's block timestamp for "last activity"
	const recentTransaction = recentData?.transactions?.at(0)
	const { data: lastActivityTimestamp } = useBlock({
		blockNumber: Hex.toBigInt(recentTransaction?.blockNumber ?? '0x0'),
		query: {
			enabled: Boolean(recentTransaction?.blockNumber),
			select: (block) => block.timestamp,
		},
	})

	// Use the real transaction count (not the approximate total from pagination)
	// Don't fetch exact count - use API hasMore flag for pagination
	// This makes the page render instantly without waiting for count query
	const totalTransactions = 0 // Unknown until user navigates
	const lastPageOffset = 0 // Can't calculate without total

	const { data: oldestData } = useQuery({
		...transactionsQueryOptions({
			address,
			page: Math.ceil(totalTransactions / 1),
			limit: 1,
			offset: lastPageOffset,
			_key: 'account-creation',
		}),
		enabled: totalTransactions > 0,
	})

	const [oldestTransaction] = oldestData?.transactions ?? []
	const { data: createdTimestamp } = useBlock({
		blockNumber: Hex.toBigInt(oldestTransaction?.blockNumber ?? '0x0'),
		query: {
			enabled: Boolean(oldestTransaction?.blockNumber),
			select: (block) => block.timestamp,
		},
	})

	const totalValue = calculateTotalHoldings(assetsData)

	return (
		<AccountCard
			address={address}
			className="self-start"
			createdTimestamp={createdTimestamp}
			lastActivityTimestamp={lastActivityTimestamp}
			totalValue={totalValue}
			accountType={accountType}
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
	live: boolean
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
		live,
	} = props
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	// Track hydration to avoid SSR/client mismatch with query data
	const isMounted = useIsMounted()

	// Contract source query - uses cache populated by SSR loader via ensureQueryData
	// The query will immediately return cached data without flashing
	const contractSourceQuery = useQuery({
		...useContractSourceQueryOptions({ address }),
		initialData: contractSource,
	})
	// Use SSR data until mounted to avoid hydration mismatch, then use query data
	const resolvedContractSource = isMounted
		? contractSourceQuery.data
		: contractSource

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
		// Override refetch settings reactively based on tab state
		refetchInterval: shouldAutoRefresh ? 4_000 : false,
		refetchOnWindowFocus: shouldAutoRefresh,
	})

	/**
	 * use initialData until mounted to avoid hydration mismatch
	 * (tanstack query may have fresher cached data that differs from SSR)
	 */
	const data = isMounted ? queryData : page === 1 ? initialData : queryData
	const {
		transactions,
		total: approximateTotal,
		hasMore,
	} = data ?? {
		transactions: [],
		total: 0,
		hasMore: false,
	}

	// Fetch exact total count in the background (only when on history tab)
	// Don't cache across tabs/pages - always show "..." until loaded each time
	const totalCountQuery = useQuery({
		queryKey: ['address-total-count', address],
		queryFn: () => fetchAddressTotalCount(address),
		staleTime: 0, // Don't cache - always refetch to show "..." while loading
		refetchInterval: false,
		refetchOnWindowFocus: false,
		enabled: isHistoryTabActive,
	})

	const batchTransactionDataContextValue = useBatchTransactionData(
		transactions,
		address,
	)

	// Exact count from dedicated API endpoint (for display only)
	// txs-count counts "from OR to" while pagination API only serves a subset,
	// so we can't use exactCount for page calculation - most pages would be empty
	// Only use after mount to avoid SSR/client hydration mismatch
	const exactCount = isMounted ? totalCountQuery.data?.data : undefined

	// For pagination: always use hasMore-based estimate
	// This ensures we only show pages that have data
	const paginationTotal = hasMore
		? Math.max(approximateTotal + limit, (page + 1) * limit)
		: approximateTotal > 0
			? approximateTotal
			: transactions.length

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
						totalItems: data && (exactCount ?? paginationTotal),
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
								totalItems={paginationTotal}
								displayCount={exactCount}
								page={page}
								fetching={isPlaceholderData}
								loading={!data}
								countLoading
								itemsLabel="transactions"
								itemsPerPage={limit}
								pagination="simple"
								emptyState="No transactions found."
							/>
						),
					},
					{
						title: 'Assets',
						totalItems: assets.length,
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
									assetsData.map((asset) => ({
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
														<span key="currency">USD</span>,
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
								totalItems={assets.length}
								page={1}
								itemsLabel="assets"
								itemsPerPage={assets.length}
								emptyState="No assets found."
							/>
						),
					},
					// Contract tab - ABI + Source Code (always shown, disabled when no data)
					{
						title: 'Contract',
						totalItems: 0,
						itemsLabel: 'items',
						visible: Boolean(contractInfo || resolvedContractSource),
						content: (
							<ContractTabContent
								address={address}
								abi={resolvedContractSource?.abi ?? contractInfo?.abi}
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
						visible: Boolean(contractInfo || resolvedContractSource),
						content: (
							<InteractTabContent
								address={address}
								abi={resolvedContractSource?.abi ?? contractInfo?.abi}
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
				batchData.receipt.effectiveGasPrice *
					batchData.receipt.cumulativeGasUsed,
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
				className="size-5"
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

function AssetAmount(props: { asset: AssetData }) {
	const { asset } = props
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span className="text-tertiary">…</span>
	const formatted = formatUnits(asset.balance, asset.metadata.decimals)
	return <span>{PriceFormatter.formatAmountShort(formatted)}</span>
}

function AssetValue(props: { asset: AssetData }) {
	const { asset } = props
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
