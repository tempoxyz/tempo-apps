import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
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
import { Address, Hex, Value } from 'ox'
import * as React from 'react'
import { Hooks } from 'tempo.ts/wagmi'
import type { RpcTransaction as Transaction, TransactionReceipt } from 'viem'
import { formatUnits } from 'viem'
import { useBlock } from 'wagmi'
import {
	getBlockQueryOptions,
	getTransactionReceiptQueryOptions,
} from 'wagmi/query'
import * as z from 'zod/mini'
import { AccountCard } from '#components/Account.tsx'
import { ContractReader } from '#components/Contract/Read.tsx'
import { DataGrid } from '#components/DataGrid.tsx'
import { EventDescription } from '#components/EventDescription.tsx'
import { NotFound } from '#components/NotFound'
import { Sections } from '#components/Sections'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	type TimeFormat,
	useTimeFormat,
} from '#components/TimeFormat'
import { cx } from '#cva.config.ts'
import * as AccountServer from '#lib/account.server.ts'
import {
	type ContractInfo,
	extractContractAbi,
	getContractBytecode,
	getContractInfo,
} from '#lib/contracts.ts'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import {
	type KnownEvent,
	type KnownEventPart,
	parseKnownEvents,
} from '#lib/known-events'
import * as Tip20 from '#lib/tip20'
import { config } from '#wagmi.config'

const defaultSearchValues = {
	page: 1,
	limit: 10,
	tab: 'history',
} as const

type TabValue = 'history' | 'assets' | 'contract'

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
		queryFn: async ({ client }) => {
			const data = await AccountServer.fetchTransactions({
				data: {
					address: params.address,
					offset: params.offset,
					limit: params.limit,
				},
			})
			const knownEvents: Record<Hex.Hex, KnownEvent[]> = {}
			const transactions = await Promise.all(
				data.transactions.map(async (transaction) => {
					// Fetch receipt and block with error handling for sync lag
					// (IndexSupply may return txs that RPC hasn't indexed yet)
					const [receipt, block] = await Promise.all([
						client
							.fetchQuery(
								getTransactionReceiptQueryOptions(config, {
									hash: transaction.hash,
								}),
							)
							.catch(() => null),
						client
							.fetchQuery(
								getBlockQueryOptions(config, {
									blockNumber: transaction.blockNumber
										? Hex.toBigInt(transaction.blockNumber)
										: undefined,
								}),
							)
							.catch(() => null),
					])
					if (receipt) {
						const getTokenMetadata = await Tip20.metadataFromLogs(receipt.logs)
						knownEvents[transaction.hash] = parseKnownEvents(receipt, {
							transaction,
							getTokenMetadata,
						})
					}
					return { ...transaction, block, receipt }
				}),
			)
			return { ...data, transactions, knownEvents }
		},
		// Default to no auto-refresh; useQuery call overrides for reactivity
		refetchInterval: false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
	})
}

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

		return {
			address,
			page,
			limit,
			offset,
			hasContract,
			contractInfo,
			transactionsData,
		}
	},
})

const assets = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c0000000000000000000000000000000000001',
	'0x20c0000000000000000000000000000000000002',
	'0x20c0000000000000000000000000000000000003',
] as const

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

	// for "created" timestamp, fetch the earliest transaction, this would be the last page of transactions
	const totalTransactions = recentData?.total ?? 0
	const lastPageOffset = Math.max(0, totalTransactions - 1)

	const { data: oldestData } = useQuery(
		transactionsQueryOptions({
			address,
			page: Math.ceil(totalTransactions / 1),
			limit: 1,
			offset: lastPageOffset,
			_key: 'account-creation',
		}),
	)

	const [oldestTransaction] = oldestData?.transactions ?? []
	const { data: createdTimestamp } = useBlock({
		blockNumber: Hex.toBigInt(oldestTransaction?.blockNumber ?? '0x0'),
		query: {
			enabled: Boolean(oldestTransaction?.blockNumber),
			select: (block) => block.timestamp,
		},
	})

	// Calculate total holdings value
	const totalValue = useAccountTotalValue(address)

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
									{ label: 'Time', align: 'start', minWidth: 100 },
									{ label: 'Hash', align: 'start' },
									{ label: 'Total', align: 'end' },
								],
								tabs: [
									{ label: 'Time', align: 'start', minWidth: 100 },
									{ label: 'Description', align: 'start' },
									{ label: 'Hash', align: 'end' },
									{ label: 'Fee', align: 'end' },
									{ label: 'Total', align: 'end' },
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
									{ label: 'Name', align: 'start' },
									{ label: 'Balance', align: 'end' },
								],
								tabs: [
									{ label: 'Name', align: 'start' },
									{ label: 'Ticker', align: 'start' },
									{ label: 'Balance', align: 'end' },
									{ label: 'Value', align: 'end' },
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

function useAccountTotalValue(address: Address.Address) {
	return useQuery({
		queryKey: ['account-total-value', address],
		queryFn: async () => {
			return await AccountServer.getTotalValue({ data: { address } })
		},
	})
}

function RouteComponent() {
	const navigate = useNavigate()
	const route = useRouter()
	const location = useLocation()
	const { address } = Route.useParams()
	const { page, tab, limit } = Route.useSearch()
	const { hasContract, contractInfo, transactionsData } = Route.useLoaderData()

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
		// preload pages around the active page (3 before and 3 after)
		for (let i = -3; i <= 3; i++) {
			if (i === 0) continue // skip current page
			const preloadPage = page + i
			if (preloadPage < 1) continue // only preload valid page numbers
			route.preloadRoute({ to: '.', search: { page: preloadPage, tab, limit } })
		}
	}, [route, page, tab, limit])

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
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1080px]',
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
			/>
		</div>
	)
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
}) {
	const {
		address,
		page,
		limit,
		activeSection,
		onSectionChange,
		contractInfo,
		initialData,
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
	const { transactions, total, knownEvents } = data ?? {
		transactions: [],
		total: 0,
		knownEvents: {} as Record<Hex.Hex, KnownEvent[]>,
	}

	// Use isPending for SSR-consistent loading state
	const isLoadingPage = isPending

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	// Only show skeleton if we have no data AND we're loading
	// Use data presence check to avoid hydration mismatch
	if (!data && isPending) return <SectionsSkeleton totalItems={total} />

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
			minWidth: 100,
		},
		{ label: 'Description', align: 'start' },
		{ label: 'Hash', align: 'end' },
		{ label: 'Fee', align: 'end' },
		{ label: 'Total', align: 'end' },
	]

	return (
		<Sections
			mode={mode}
			sections={[
				{
					title: 'History',
					totalItems: total,
					itemsLabel: 'transactions',
					content: historyError ?? (
						<DataGrid
							columns={{
								stacked: historyColumns,
								tabs: historyColumns,
							}}
							items={() =>
								transactions.map((transaction) => {
									// receipt/block can be null if RPC hasn't indexed yet
									const receipt = transaction.receipt ?? undefined
									const block = transaction.block
									return {
										cells: [
											block ? (
												<TransactionTimestamp
													key="time"
													timestamp={block.timestamp}
													link={`/tx/${transaction.hash}`}
													format={timeFormat}
												/>
											) : (
												<span key="time" className="text-tertiary text-[13px]">
													Pending...
												</span>
											),
											<TransactionRowDescription
												key="desc"
												transaction={transaction}
												knownEvents={knownEvents[transaction.hash] ?? []}
												receipt={receipt}
												accountAddress={address}
											/>,
											<TransactionHash key="hash" hash={transaction.hash} />,
											<TransactionFee key="fee" receipt={receipt} />,
											<TransactionRowTotal
												key="total"
												transaction={transaction}
												knownEvents={knownEvents[transaction.hash] ?? []}
												receipt={receipt}
											/>,
										],
										link: {
											href: `/tx/${transaction.hash}`,
											title: `View receipt ${transaction.hash}`,
										},
									}
								})
							}
							totalItems={total}
							page={page}
							isPending={isLoadingPage}
							itemsLabel="transactions"
							itemsPerPage={limit}
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
									{ label: 'Name', align: 'start' },
									{ label: 'Contract', align: 'start' },
									{ label: 'Amount', align: 'end' },
								],
								tabs: [
									{ label: 'Name', align: 'start' },
									{ label: 'Ticker', align: 'start' },
									{ label: 'Currency', align: 'start' },
									{ label: 'Amount', align: 'end' },
									{ label: 'Value', align: 'end' },
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
	)
}

function TransactionRowDescription(props: {
	transaction: Transaction
	knownEvents: KnownEvent[]
	receipt?: TransactionReceipt
	accountAddress: Address.Address
}) {
	const { transaction, knownEvents, receipt, accountAddress } = props

	return (
		<TransactionDescription
			transaction={transaction}
			knownEvents={knownEvents}
			transactionReceipt={receipt}
			accountAddress={accountAddress}
		/>
	)
}

function TransactionRowTotal(props: {
	transaction: Transaction
	knownEvents: KnownEvent[]
	receipt?: TransactionReceipt
}) {
	const { transaction, knownEvents } = props

	return (
		<TransactionTotal transaction={transaction} knownEvents={knownEvents} />
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

export function TransactionFee(props: { receipt?: TransactionReceipt }) {
	const { receipt } = props

	if (!receipt) return <span className="text-tertiary">…</span>

	const fee = Number(
		Value.format(receipt.effectiveGasPrice * receipt.gasUsed, 18),
	)

	return <span className="text-tertiary">{PriceFormatter.format(fee)}</span>
}

function TransactionDescription(props: {
	transaction: Transaction
	knownEvents: Array<KnownEvent>
	transactionReceipt: TransactionReceipt | undefined
	accountAddress: Address.Address
}) {
	const { knownEvents, accountAddress } = props

	const transformEvent = React.useCallback(
		(event: KnownEvent) => getPerspectiveEvent(event, accountAddress),
		[accountAddress],
	)

	return (
		<EventDescription.ExpandGroup
			events={knownEvents}
			seenAs={accountAddress}
			transformEvent={transformEvent}
		/>
	)
}

export function getPerspectiveEvent(
	event: KnownEvent,
	accountAddress?: Address.Address,
) {
	if (!accountAddress) return event
	if (event.type !== 'send') return event
	const toMatches =
		event.meta?.to && Address.isEqual(event.meta.to, accountAddress)
	const fromMatches =
		event.meta?.from && Address.isEqual(event.meta.from, accountAddress)
	if (!toMatches || fromMatches) return event

	const sender = event.meta?.from
	const updatedParts = event.parts.map((part) => {
		if (part.type === 'action') return { ...part, value: 'Received' }
		if (part.type === 'text' && part.value.toLowerCase() === 'to')
			return { ...part, value: 'from' }
		if (part.type === 'account' && sender) return { ...part, value: sender }
		return part
	})
	return { ...event, parts: updatedParts }
}

export function TransactionHash(props: { hash: Hex.Hex }) {
	const { hash } = props
	return (
		<div className="text-[13px] text-tertiary whitespace-nowrap" title={hash}>
			{HexFormatter.truncate(hash, 4)}
		</div>
	)
}

export function TransactionTimestamp(props: {
	timestamp: bigint
	link?: string
	format?: TimeFormat
}) {
	const { timestamp, link, format = 'relative' } = props

	return (
		<div className="text-nowrap">
			{link ? (
				<Link to={link} className="text-tertiary">
					<FormattedTimestamp timestamp={timestamp} format={format} />
				</Link>
			) : (
				<FormattedTimestamp
					timestamp={timestamp}
					format={format}
					className="text-tertiary"
				/>
			)}
		</div>
	)
}

export function TransactionTotal(props: {
	transaction: Transaction
	knownEvents: KnownEvent[]
}) {
	const { transaction, knownEvents } = props

	const amountParts = React.useMemo(
		() =>
			knownEvents.flatMap((event) =>
				event.parts.filter(
					(part): part is Extract<KnownEventPart, { type: 'amount' }> =>
						part.type === 'amount',
				),
			),
		[knownEvents],
	)

	const totalValue = amountParts.reduce((sum, part) => {
		const decimals = part.value.decimals ?? 6
		return sum + Number(Value.format(part.value.value, decimals))
	}, 0)

	if (totalValue === 0) {
		const value = transaction.value ? Hex.toBigInt(transaction.value) : 0n
		if (value === 0n) return <span className="text-tertiary">—</span>
		return (
			<span className="text-primary">
				{PriceFormatter.format(value, { decimals: 18, format: 'short' })}
			</span>
		)
	}

	return (
		<span className="text-primary">{PriceFormatter.format(totalValue)}</span>
	)
}
