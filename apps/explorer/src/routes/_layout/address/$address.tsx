import {
	keepPreviousData,
	queryOptions,
	useQueries,
	useQuery,
} from '@tanstack/react-query'
import {
	createFileRoute,
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
import type { RpcTransaction as Transaction } from 'viem'
import { formatUnits, isHash } from 'viem'
import { useBlock } from 'wagmi'
import { getBlock, getChainId, getTransactionReceipt } from 'wagmi/actions'
import * as z from 'zod/mini'
import { AccountCard } from '#components/address/Account.tsx'
import { ContractReader } from '#components/contract/Read.tsx'
import {
	BatchTransactionDataContext,
	type TransactionData,
	TransactionDescription,
	TransactionTimestamp,
	TransactionTotal,
	useTransactionDataFromBatch,
} from '#components/transaction/TransactionRow.tsx'
import { TruncatedHash } from '#components/transaction/TruncatedHash'
import { DataGrid } from '#components/ui/DataGrid.tsx'
import { NotFound } from '#components/ui/NotFound'
import { Sections } from '#components/ui/Sections'
import {
	TimeColumnHeader,
	type TimeFormat,
	useTimeFormat,
} from '#components/ui/TimeFormat'
import { cx } from '#cva.config.ts'
import {
	type ContractInfo,
	extractContractAbi,
	getContractBytecode,
	getContractInfo,
} from '#lib/domain/contracts'
import { parseKnownEvents } from '#lib/domain/known-events'
import * as Tip20 from '#lib/domain/tip20'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import * as AccountServer from '#lib/server/account.server.ts'
import { config, getConfig } from '#wagmi.config.ts'

const defaultSearchValues = {
	page: 1,
	limit: 10,
	tab: 'history',
} as const

type TabValue = 'history' | 'assets' | 'contract'

function useBatchTransactionData(transactions: Transaction[]) {
	const hashes = React.useMemo(
		() => transactions.map((tx) => tx.hash).filter(isHash),
		[transactions],
	)

	const queries = useQueries({
		queries: hashes.map((hash) => ({
			queryKey: ['tx-data-batch', hash],
			queryFn: async (): Promise<TransactionData | null> => {
				const cfg = getConfig()
				const receipt = await getTransactionReceipt(cfg, { hash })
				const [block, getTokenMetadata] = await Promise.all([
					getBlock(cfg, { blockHash: receipt.blockHash }),
					Tip20.metadataFromLogs(receipt.logs),
				])
				const transaction = transactions.find((tx) => tx.hash === hash)
				const knownEvents = parseKnownEvents(receipt, {
					transaction,
					getTokenMetadata,
				})
				return { receipt, block, knownEvents }
			},
			staleTime: 60_000,
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

type TransactionQuery = {
	address: Address.Address
	page: number
	limit: number
	offset: number
	_key?: string | undefined
}

function transactionsQueryOptions(params: TransactionQuery) {
	return queryOptions({
		queryKey: [
			'account-transactions',
			params.address,
			params.page,
			params.limit,
			params._key,
		],
		queryFn: () =>
			AccountServer.fetchTransactions({
				data: {
					address: params.address,
					offset: params.offset,
					limit: params.limit,
				},
			}),
		refetchInterval: false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
	})
}

const assets = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c0000000000000000000000000000000000001',
	'0x20c0000000000000000000000000000000000002',
	'0x20c0000000000000000000000000000000000003',
] as const

export const Route = createFileRoute('/_layout/address/$address')({
	component: RouteComponent,
	notFoundComponent: NotFound,
	validateSearch: z.object({
		page: z.prefault(z.number(), defaultSearchValues.page),
		limit: z.prefault(
			z.pipe(
				z.number(),
				z.transform((val) => Math.min(100, val)),
			),
			defaultSearchValues.limit,
		),
		tab: z.prefault(
			z.enum(['history', 'assets', 'contract']),
			defaultSearchValues.tab,
		),
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loaderDeps: ({ search: { page, limit } }) => ({ page, limit }),
	loader: async ({ deps: { page, limit }, params, context }) => {
		const { address } = params
		// Only throw notFound for truly invalid addresses
		if (!Address.validate(address))
			throw notFound({
				routeId: rootRouteId,
				data: { error: 'Invalid address format' },
			})

		const offset = (page - 1) * limit

		// check if it's a known contract from our registry
		let contractInfo: ContractInfo | undefined = getContractInfo(address)

		// if not in registry, try to extract ABI from bytecode using whatsabi
		if (!contractInfo) {
			const contractBytecode = await getContractBytecode(address).catch(
				() => undefined,
			)

			if (contractBytecode) {
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
		}

		const hasContract = Boolean(contractInfo)

		const transactionsData = await context.queryClient
			.ensureQueryData(
				transactionsQueryOptions({
					address,
					page,
					limit,
					offset,
				}),
			)
			.catch((error) => {
				console.error('Fetch error (non-blocking):', error)
				return undefined
			})

		const addressTransactionCount = await context.queryClient.ensureQueryData({
			queryKey: ['address-transaction-count', address],
			queryFn: () =>
				AccountServer.fetchAddressTransactionsCount({
					data: { address, chainId: getChainId(config) },
				}),
			staleTime: 30_000,
		})

		return {
			address,
			page,
			limit,
			offset,
			hasContract,
			contractInfo,
			transactionsData,
			addressTransactionCount,
		}
	},
})

function RouteComponent() {
	const navigate = useNavigate()
	const router = useRouter()
	const location = useLocation()
	const { address } = Route.useParams()
	const { page, tab, limit } = Route.useSearch()
	const {
		hasContract,
		contractInfo,
		transactionsData,
		addressTransactionCount,
	} = Route.useLoaderData()

	Address.assert(address)

	const hash = location.hash

	// Track which hash we've already redirected for (prevents re-redirect when
	// user manually switches tabs, but allows redirect for new hash values)
	const redirectedForHashRef = React.useRef<string | null>(null)

	// When URL has a hash fragment (e.g., #functionName), switch to contract tab
	React.useEffect(() => {
		// Only redirect if:
		// 1. We have a hash
		// 2. Address has a known contract
		// 3. Not already on contract tab
		// 4. Haven't already redirected for this specific hash
		if (
			hash &&
			hasContract &&
			tab !== 'contract' &&
			redirectedForHashRef.current !== hash
		) {
			redirectedForHashRef.current = hash
			navigate({
				to: '.',
				search: { page: 1, tab: 'contract', limit },
				hash,
				replace: true,
				resetScroll: false,
			})
		}
	}, [hash, hasContract, tab, navigate, limit])

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
			const tabs: TabValue[] = hasContract
				? ['history', 'assets', 'contract']
				: ['history', 'assets']
			const newTab = tabs[newIndex] ?? 'history'
			navigate({
				to: '.',
				search: { page, tab: newTab, limit },
				resetScroll: false,
			})
		},
		[navigate, page, limit, hasContract],
	)

	const activeSection =
		tab === 'history' ? 0 : tab === 'assets' ? 1 : hasContract ? 2 : 0

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1280px]',
			)}
		>
			<AccountCardWithTimestamps address={address} />
			<SectionsWrapper
				address={address}
				page={page}
				limit={limit}
				activeSection={activeSection}
				onSectionChange={setActiveSection}
				contractInfo={contractInfo}
				initialData={transactionsData}
				addressTransactionCount={addressTransactionCount}
			/>
		</div>
	)
}

function AccountCardWithTimestamps(props: { address: Address.Address }) {
	const { address } = props

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
	const { data: exactTotal } = useTransactionCount(address)
	const totalTransactions = Number(exactTotal ?? 0n)
	const lastPageOffset = Math.max(0, totalTransactions - 1)

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

	// Calculate total holdings value
	const totalValue = useQuery({
		queryKey: ['account-total-value', address],
		queryFn: () => AccountServer.getTotalValue({ data: { address } }),
	})

	return (
		<AccountCard
			address={address}
			className="self-start"
			createdTimestamp={createdTimestamp}
			lastActivityTimestamp={lastActivityTimestamp}
			totalValue={totalValue.data}
		/>
	)
}

function SectionsSkeleton({ totalItems }: { totalItems: number }) {
	const isMobile = useMediaQuery('(max-width: 799px)')
	return (
		<Sections
			mode={isMobile ? 'stacked' : 'tabs'}
			sections={[
				{
					title: 'History',
					totalItems,
					itemsLabel: 'transactions',
					content: (
						<DataGrid
							columns={{
								stacked: [
									{ label: 'Time', align: 'start', width: '0.5fr' },
									{ label: 'Hash', align: 'start', width: '1fr' },
									{ label: 'Total', align: 'end', width: '0.5fr' },
								],
								tabs: [
									{ label: 'Time', align: 'start', width: '0.5fr' },
									{ label: 'Description', align: 'start', width: '2fr' },
									{ label: 'Hash', align: 'end', width: '1fr' },
									{ label: 'Fee', align: 'end', width: '0.5fr' },
									{ label: 'Total', align: 'end', width: '0.5fr' },
								],
							}}
							items={(mode) =>
								Array.from(
									{ length: defaultSearchValues.limit },
									(_, index) => {
										const key = `skeleton-${index}`
										return {
											cells:
												mode === 'stacked'
													? [
															<div key={`${key}-time`} className="h-[20px]" />,
															<div key={`${key}-hash`} className="h-[20px]" />,
															<div key={`${key}-total`} className="h-[20px]" />,
														]
													: [
															<div key={`${key}-time`} className="h-[20px]" />,
															<div key={`${key}-desc`} className="h-[20px]" />,
															<div key={`${key}-hash`} className="h-[20px]" />,
															<div key={`${key}-fee`} className="h-[20px]" />,
															<div key={`${key}-total`} className="h-[20px]" />,
														],
										}
									},
								)
							}
							totalItems={totalItems}
							page={1}
							isPending={false}
							itemsLabel="transactions"
							itemsPerPage={defaultSearchValues.limit}
						/>
					),
				},
				{
					title: 'Assets',
					totalItems: 0,
					itemsLabel: 'assets',
					content: (
						<DataGrid
							columns={{
								stacked: [
									{ label: 'Name', align: 'start', width: '1fr' },
									{ label: 'Balance', align: 'end', width: '0.5fr' },
								],
								tabs: [
									{ label: 'Name', align: 'start', width: '1fr' },
									{ label: 'Ticker', align: 'start', width: '0.5fr' },
									{ label: 'Balance', align: 'end', width: '0.5fr' },
									{ label: 'Value', align: 'end', width: '0.5fr' },
								],
							}}
							items={() => []}
							totalItems={0}
							page={1}
							isPending={false}
							itemsLabel="assets"
						/>
					),
				},
			]}
			activeSection={0}
			onSectionChange={() => {}}
		/>
	)
}

function useTransactionCount(address: Address.Address) {
	return useQuery({
		queryKey: ['account-transaction-count', address],
		queryFn: () =>
			AccountServer.fetchAddressTransactionsCount({
				data: { address, chainId: getChainId(config) },
			}),
		staleTime: 30_000,
	})
}

type TransactionsData = Awaited<
	ReturnType<
		NonNullable<ReturnType<typeof transactionsQueryOptions>['queryFn']>
	>
>

function SectionsWrapper(props: {
	address: Address.Address
	page: number
	limit: number
	activeSection: number
	onSectionChange: (index: number) => void
	contractInfo: ContractInfo | undefined
	initialData: TransactionsData | undefined
	addressTransactionCount: bigint
}) {
	const {
		address,
		page,
		limit,
		activeSection,
		onSectionChange,
		contractInfo,
		initialData,
		addressTransactionCount,
	} = props
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	const isHistoryTabActive = activeSection === 0
	// Only auto-refresh on page 1 when history tab is active
	const shouldAutoRefresh = page === 1 && isHistoryTabActive

	const { data, isPending, error } = useQuery({
		...transactionsQueryOptions({
			address,
			page,
			limit,
			offset: (page - 1) * limit,
		}),
		initialData,
		// Override refetch settings reactively based on tab state
		refetchInterval: shouldAutoRefresh ? 4_000 : false,
		refetchOnWindowFocus: shouldAutoRefresh,
	})
	const { transactions, total: approximateTotal } = data ?? {
		transactions: [],
		total: 0,
	}

	const batchTransactionDataContextValue = useBatchTransactionData(transactions)

	const { data: exactTotal } = useTransactionCount(address)
	const total = exactTotal ?? approximateTotal

	// Use isPending for SSR-consistent loading state
	const isLoadingPage = isPending

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	// Only show skeleton if we have no data AND we're loading
	// Use data presence check to avoid hydration mismatch
	if (!data && isPending)
		return <SectionsSkeleton totalItems={Number(addressTransactionCount)} />

	// Show error state for API failures (instead of crashing the whole page)
	const historyError = error ? (
		<div className="rounded-[10px] bg-card-header p-[18px]">
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
						totalItems: Number(total),
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
											<TransactionRowTime
												key="time"
												transaction={transaction}
												format={timeFormat}
											/>,
											<TransactionRowDescription
												key="desc"
												transaction={transaction}
												accountAddress={address}
											/>,
											<TruncatedHash
												key="hash"
												minChars={8}
												hash={transaction.hash}
											/>,
											<TransactionRowFee key="fee" transaction={transaction} />,
											<TransactionTotal
												key="total"
												transaction={transaction}
											/>,
										],
										link: {
											href: `/tx/${transaction.hash}`,
											title: `View receipt ${transaction.hash}`,
										},
									}))
								}
								totalItems={Number(total)}
								page={page}
								isPending={isLoadingPage}
								itemsLabel="transactions"
								itemsPerPage={limit}
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
									assets.map((assetAddress) => ({
										cells:
											mode === 'stacked'
												? [
														<TokenName
															key="name"
															contractAddress={assetAddress}
														/>,
														<AssetContract
															key="contract"
															contractAddress={assetAddress}
														/>,
														<AssetAmount
															key="amount"
															contractAddress={assetAddress}
															accountAddress={address}
														/>,
													]
												: [
														<TokenName
															key="name"
															contractAddress={assetAddress}
														/>,
														<TokenSymbol
															key="symbol"
															contractAddress={assetAddress}
														/>,
														<span key="currency">USD</span>,
														<AssetAmount
															key="amount"
															contractAddress={assetAddress}
															accountAddress={address}
														/>,
														<AssetValue
															key="value"
															contractAddress={assetAddress}
															accountAddress={address}
														/>,
													],
										link: {
											href: `/token/${assetAddress}`,
											title: `View token ${assetAddress}`,
										},
									}))
								}
								totalItems={assets.length}
								page={1}
								isPending={false}
								itemsLabel="assets"
								itemsPerPage={assets.length}
								emptyState="No assets found."
							/>
						),
					},
					// Contract tab - only shown for known contracts
					...(contractInfo
						? [
								{
									title: 'Contract',
									totalItems: 0,
									itemsLabel: 'functions',
									content: (
										<ContractReader
											address={address}
											abi={contractInfo.abi}
											docsUrl={contractInfo.docsUrl}
										/>
									),
								},
							]
						: []),
				]}
				activeSection={activeSection}
				onSectionChange={onSectionChange}
			/>
		</BatchTransactionDataContext.Provider>
	)
}

function TransactionRowTime(props: {
	transaction: Transaction
	format: TimeFormat
}) {
	const { transaction, format } = props
	const batchData = useTransactionDataFromBatch(transaction.hash)

	if (!batchData?.block) {
		return <span className="text-tertiary">—</span>
	}

	return (
		<TransactionTimestamp
			timestamp={batchData.block.timestamp}
			link={`/tx/${transaction.hash}`}
			format={format}
		/>
	)
}

function TransactionRowDescription(props: {
	transaction: Transaction
	accountAddress: Address.Address
}) {
	const { transaction, accountAddress } = props
	const batchData = useTransactionDataFromBatch(transaction.hash)

	if (!batchData) return <span className="text-tertiary">—</span>
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

function TransactionRowFee(props: { transaction: Transaction }) {
	const { transaction } = props
	const batchData = useTransactionDataFromBatch(transaction.hash)

	if (!batchData?.receipt) return <span className="text-tertiary">—</span>

	const fee =
		batchData.receipt.effectiveGasPrice * batchData.receipt.cumulativeGasUsed

	return (
		<span className="text-tertiary">
			{PriceFormatter.format(fee, { decimals: 18, format: 'short' })}
		</span>
	)
}

function TokenName(props: { contractAddress: Address.Address }) {
	const { contractAddress } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	return <span>{metadata?.name || 'Unknown Token'}</span>
}

function TokenSymbol(props: { contractAddress: Address.Address }) {
	const { contractAddress } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	return <span className="text-accent">{metadata?.symbol || 'TOKEN'}</span>
}

function AssetContract(props: { contractAddress: Address.Address }) {
	const { contractAddress } = props

	return (
		<span className="text-accent text-[13px]">
			{HexFormatter.truncate(contractAddress, 10)}
		</span>
	)
}

function AssetAmount(props: {
	contractAddress: Address.Address
	accountAddress: Address.Address
}) {
	const { contractAddress, accountAddress } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	const { data: balance } = Hooks.token.useGetBalance({
		token: contractAddress,
		account: accountAddress,
		query: {
			enabled: Boolean(accountAddress && contractAddress),
		},
	})

	return (
		<span className="text-[12px]">
			{metadata?.decimals !== undefined &&
				PriceFormatter.formatAmount(
					formatUnits(balance ?? 0n, metadata.decimals),
				)}
		</span>
	)
}

function AssetValue(props: {
	contractAddress: Address.Address
	accountAddress: Address.Address
}) {
	const { contractAddress, accountAddress } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	const { data: balance } = Hooks.token.useGetBalance({
		token: contractAddress,
		account: accountAddress,
		query: {
			enabled: Boolean(accountAddress && contractAddress),
		},
	})

	return (
		<span className="text-[12px]">
			{metadata?.decimals !== undefined &&
				PriceFormatter.format(balance ?? 0n, {
					decimals: metadata.decimals,
					format: 'short',
				})}
		</span>
	)
}
