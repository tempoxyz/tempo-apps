import { useQuery } from '@tanstack/react-query'
import {
	ClientOnly,
	createFileRoute,
	Link,
	notFound,
	redirect,
	stripSearchParams,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { Address } from 'ox'
import * as React from 'react'
import { Actions, Hooks } from 'tempo.ts/wagmi'
import { formatUnits } from 'viem'
import * as z from 'zod/mini'
import { AddressCell } from '#comps/AddressCell'
import { AmountCell, BalanceCell } from '#comps/AmountCell'
import { ContractReader } from '#comps/ContractReader'
import { DataGrid } from '#comps/DataGrid'
import { InfoCard } from '#comps/InfoCard'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import { TimeColumnHeader, useTimeFormat } from '#comps/TimeFormat'
import { TimestampCell } from '#comps/TimestampCell'
import { TransactionCell } from '#comps/TransactionCell'
import { TruncatedHash } from '#comps/TruncatedHash'
import { cx } from '#cva.config.ts'
import { ellipsis } from '#lib/chars'
import { getContractInfo } from '#lib/domain/contracts'
import { PriceFormatter } from '#lib/formatting'
import { useCopy, useMediaQuery } from '#lib/hooks'
import { holdersQueryOptions, transfersQueryOptions } from '#lib/queries'
import { config } from '#wagmi.config'
import CopyIcon from '~icons/lucide/copy'
import XIcon from '~icons/lucide/x'

const defaultSearchValues = {
	page: 1,
	limit: 10,
	tab: 'transfers',
} as const

const tabOrder = ['transfers', 'holders', 'contract'] as const

type TokenMetadata = Actions.token.getMetadata.ReturnValue

export const Route = createFileRoute('/_layout/token/$address')({
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
			z.pipe(
				z.string(),
				z.transform((val) => {
					if (val === 'transfers' || val === 'holders' || val === 'contract')
						return val
					return 'transfers'
				}),
			),
			defaultSearchValues.tab,
		),
		a: z.optional(z.string()),
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loaderDeps: ({ search: { page, limit, tab, a } }) => ({
		page,
		limit,
		tab,
		a,
	}),
	loader: async ({ deps: { page, limit, tab, a }, params, context }) => {
		const { address } = params
		if (!Address.validate(address)) throw notFound()

		const account = a && Address.validate(a) ? a : undefined
		const offset = (page - 1) * limit

		try {
			// prefetch holders in background (non-blocking) - slow query that reconstructs all balances
			// prefetch page 1 for sidebar stats, and current page for holders tab
			context.queryClient.prefetchQuery(
				holdersQueryOptions({ address, page: 1, limit: 10, offset: 0 }),
			)
			if (page !== 1 || limit !== 10) {
				context.queryClient.prefetchQuery(
					holdersQueryOptions({ address, page, limit, offset }),
				)
			}

			if (tab === 'transfers') {
				const [metadata, transfers] = await Promise.all([
					Actions.token.getMetadata(config, { token: address }),
					context.queryClient.ensureQueryData(
						transfersQueryOptions({ address, page, limit, offset, account }),
					),
				])
				return { metadata, transfers }
			}

			const metadata = await Actions.token.getMetadata(config, {
				token: address,
			})
			return { metadata, transfers: undefined }
		} catch (error) {
			console.error(error)
			// redirect to `/address/$address` and if it's not an address, that route will throw a notFound
			throw redirect({ to: '/address/$address', params: { address } })
		}
	},
	params: {
		parse: z.object({
			address: z.pipe(
				z.string(),
				z.transform((x) => {
					Address.assert(x)
					return x
				}),
			),
		}).parse,
	},
})

function RouteComponent() {
	const navigate = useNavigate()
	const route = useRouter()
	const { address } = Route.useParams()
	const { page, tab, limit, a } = Route.useSearch()
	const loaderData = Route.useLoaderData()

	React.useEffect(() => {
		// Preload only 1 page before and after to reduce API calls
		for (let i = -1; i <= 1; i++) {
			if (i === 0) continue
			const preloadPage = page + i
			if (preloadPage < 1) continue
			route.preloadRoute({
				to: '.',
				search: {
					...(preloadPage !== 1 ? { page: preloadPage } : {}),
					...(tab !== 'transfers' ? { tab } : {}),
					...(a ? { a } : {}),
					...(limit !== defaultSearchValues.limit ? { limit } : {}),
				},
			})
		}
	}, [route, page, tab, limit, a])

	const goToPage = React.useCallback(
		(newPage: number) => {
			navigate({
				to: '.',
				search: () => ({
					...(newPage !== 1 ? { page: newPage } : {}),
					...(tab !== 'transfers' ? { tab } : {}),
					...(a ? { a } : {}),
					...(limit !== defaultSearchValues.limit ? { limit } : {}),
				}),
				resetScroll: false,
			})
		},
		[navigate, tab, limit, a],
	)

	const setActiveSection = React.useCallback(
		(newIndex: number) => {
			const newTab = tabOrder[newIndex] ?? 'transfers'
			navigate({
				to: '.',
				search: () => ({
					...(newTab !== 'transfers' ? { tab: newTab } : {}),
					...(a && newTab === 'transfers' ? { a } : {}),
					...(limit !== defaultSearchValues.limit ? { limit } : {}),
				}),
				resetScroll: false,
			})
		},
		[navigate, limit, a],
	)

	const activeSection = tab === 'holders' ? 1 : tab === 'contract' ? 2 : 0

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1080px]',
			)}
		>
			<TokenCard
				address={address}
				className="self-start"
				initialMetadata={loaderData.metadata}
			/>
			<SectionsWrapper
				address={address}
				page={page}
				limit={limit}
				account={a}
				goToPage={goToPage}
				activeSection={activeSection}
				onSectionChange={setActiveSection}
			/>
		</div>
	)
}

function TokenCard(props: {
	address: Address.Address
	className?: string
	initialMetadata?: TokenMetadata
}) {
	const { address, className, initialMetadata } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: address,
		query: {
			enabled: Boolean(address),
			initialData: initialMetadata,
		},
	})

	// Fetch holders summary asynchronously (was prefetched in loader)
	const { data: holdersSummary } = useQuery(
		holdersQueryOptions({ address, page: 1, limit: 10, offset: 0 }),
	)

	const { copy, notifying } = useCopy()

	const totalSupply = holdersSummary?.totalSupply
		? BigInt(holdersSummary.totalSupply)
		: undefined
	const totalHolders = holdersSummary?.total

	return (
		<InfoCard
			title={
				<div className="flex items-center justify-between px-[18px] pt-[10px] pb-[8px]">
					<h1 className="text-[13px] uppercase text-tertiary select-none">
						Token
					</h1>
					{metadata?.symbol && (
						<h2 className="text-[13px]">{metadata.symbol}</h2>
					)}
				</div>
			}
			className={className}
			sections={[
				<button
					key="address"
					type="button"
					onClick={() => copy(address)}
					className="w-full text-left cursor-pointer press-down text-tertiary"
					title={address}
				>
					<div className="flex items-center gap-[8px] mb-[8px]">
						<span className="text-[13px] font-normal capitalize">Address</span>
						<div className="relative flex items-center">
							<CopyIcon className="w-[12px] h-[12px]" />
							{notifying && (
								<span className="absolute left-[calc(100%+8px)] text-[13px] leading-[16px]">
									copied
								</span>
							)}
						</div>
					</div>
					<p className="text-[14px] font-normal leading-[17px] tracking-[0.02em] text-primary break-all max-w-[22ch]">
						{address}
					</p>
				</button>,
				{
					label: 'Created',
					value: (
						<ClientOnly
							fallback={
								<span className="text-tertiary text-[13px]">{ellipsis}</span>
							}
						>
							<span className="text-tertiary text-[13px]">{ellipsis}</span>
						</ClientOnly>
					),
				},
				{
					label: 'Holdings',
					value: (
						<ClientOnly
							fallback={
								<span className="text-tertiary text-[13px]">{ellipsis}</span>
							}
						>
							<span className="text-[13px] text-primary">$0.00</span>
						</ClientOnly>
					),
				},
				{
					label: 'Supply',
					value: (
						<ClientOnly
							fallback={
								<span className="text-tertiary text-[13px]">{ellipsis}</span>
							}
						>
							{totalSupply !== undefined && metadata?.decimals !== undefined ? (
								<span
									className="text-[13px] text-primary"
									title={PriceFormatter.format(
										Number(formatUnits(totalSupply, metadata.decimals)),
									)}
								>
									{PriceFormatter.format(
										Number(formatUnits(totalSupply, metadata.decimals)),
										{ format: 'short' },
									)}
								</span>
							) : (
								<span className="text-tertiary text-[13px]">{ellipsis}</span>
							)}
						</ClientOnly>
					),
				},
				{
					label: 'Holders',
					value: (
						<ClientOnly
							fallback={
								<span className="text-tertiary text-[13px]">{ellipsis}</span>
							}
						>
							{totalHolders !== undefined ? (
								<span className="text-[13px] text-primary">{totalHolders}</span>
							) : (
								<span className="text-tertiary text-[13px]">{ellipsis}</span>
							)}
						</ClientOnly>
					),
				},
			]}
		/>
	)
}

function SectionsSkeleton({ totalItems }: { totalItems: number }) {
	const isMobile = useMediaQuery('(max-width: 799px)')

	const transfersColumns: DataGrid.Column[] = [
		{ label: 'Time', align: 'start', minWidth: 100 },
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

	return (
		<Sections
			mode={isMobile ? 'stacked' : 'tabs'}
			sections={[
				{
					title: 'Transfers',
					totalItems,
					itemsLabel: 'transfers',
					content: (
						<DataGrid
							columns={{
								stacked: transfersColumns,
								tabs: transfersColumns,
							}}
							items={() =>
								Array.from(
									{ length: defaultSearchValues.limit },
									(_, index) => {
										const key = `skeleton-${index}`
										return {
											cells: [
												<div key={`${key}-time`} className="h-5" />,
												<div key={`${key}-tx`} className="h-5" />,
												<div key={`${key}-from`} className="h-5" />,
												<div key={`${key}-to`} className="h-5" />,
												<div key={`${key}-amount`} className="h-5" />,
											],
										}
									},
								)
							}
							totalItems={totalItems}
							page={1}
							isPending={false}
							itemsLabel="transfers"
							itemsPerPage={defaultSearchValues.limit}
						/>
					),
				},
				{
					title: 'Holders',
					totalItems: 0,
					itemsLabel: 'holders',
					content: (
						<DataGrid
							columns={{
								stacked: holdersColumns,
								tabs: holdersColumns,
							}}
							items={() => []}
							totalItems={0}
							page={1}
							isPending={false}
							itemsLabel="holders"
						/>
					),
				},
				{
					title: 'Contract',
					totalItems: 0,
					itemsLabel: 'functions',
					content: (
						<div className="animate-pulse space-y-[12px]">
							<div className="h-[200px] rounded-[10px] bg-card-header" />
							<div className="h-[300px] rounded-[10px] bg-card-header" />
						</div>
					),
				},
			]}
			activeSection={0}
			onSectionChange={() => {}}
		/>
	)
}

function SectionsWrapper(props: {
	address: Address.Address
	page: number
	limit: number
	account?: string
	goToPage: (page: number) => void
	activeSection: number
	onSectionChange: (index: number) => void
}) {
	const {
		address,
		page,
		limit,
		account: account_,
		activeSection,
		onSectionChange,
	} = props
	const account = account_ && Address.validate(account_) ? account_ : undefined
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	const state = useRouterState()
	const loaderData = Route.useLoaderData()

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: address,
		query: {
			enabled: Boolean(address),
			initialData: loaderData.metadata,
		},
	})

	const transfersQueryPage = activeSection === 0 ? page : 1
	const transfersOptions = transfersQueryOptions({
		address,
		page: transfersQueryPage,
		limit,
		offset: activeSection === 0 ? (page - 1) * limit : 0,
		account,
	})

	const { data: transfersData, isLoading: isLoadingTransfers } = useQuery({
		...transfersOptions,
		...(activeSection === 0 &&
		transfersQueryPage === page &&
		loaderData.transfers
			? { initialData: loaderData.transfers }
			: {}),
	})

	const holdersQueryPage = activeSection === 1 ? page : 1
	const holdersOptions = holdersQueryOptions({
		address,
		page: holdersQueryPage,
		limit,
		offset: activeSection === 1 ? (page - 1) * limit : 0,
	})

	const { data: holdersData, isLoading: isLoadingHolders } =
		useQuery(holdersOptions)

	const { transfers = [], total: transfersTotal = 0 } = transfersData ?? {}

	const { holders = [], total: holdersTotal = 0 } = holdersData ?? {}

	const routeIsLoading =
		state.isLoading && state.location.pathname.includes('/token/')
	const transfersPending = routeIsLoading || isLoadingTransfers
	const holdersPending = routeIsLoading || isLoadingHolders

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	if (transfers.length === 0 && transfersPending && activeSection === 0)
		return <SectionsSkeleton totalItems={transfersTotal} />

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

	return (
		<Sections
			mode={mode}
			sections={[
				{
					title: 'Transfers',
					totalItems: transfersTotal,
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
											decimals={metadata?.decimals}
											symbol={metadata?.symbol}
										/>,
									],
									link: {
										href: `/receipt/${transfer.transactionHash}`,
										title: `View receipt ${transfer.transactionHash}`,
									},
								}))
							}}
							totalItems={transfersTotal}
							page={page}
							isPending={transfersPending}
							itemsLabel="transfers"
							itemsPerPage={limit}
							emptyState="No transfers found."
						/>
					),
				},
				{
					title: 'Holders',
					totalItems: holdersTotal,
					itemsLabel: 'holders',
					content: (
						<DataGrid
							columns={{
								stacked: holdersColumns,
								tabs: holdersColumns,
							}}
							items={() =>
								holders.map((holder) => ({
									cells: [
										<AddressCell key="address" address={holder.address} />,
										<BalanceCell
											key="balance"
											balance={holder.balance}
											decimals={metadata?.decimals}
										/>,
										<span key="percentage" className="text-[12px] text-primary">
											{holder.percentage.toFixed(2)}%
										</span>,
									],
									link: {
										href: `/token/${address}?a=${holder.address}`,
										title: `View transfers for ${holder.address}`,
									},
								}))
							}
							totalItems={holdersTotal}
							page={page}
							isPending={holdersPending}
							itemsLabel="holders"
							itemsPerPage={limit}
							emptyState="No holders found."
						/>
					),
				},
				{
					title: 'Contract',
					totalItems: 0,
					itemsLabel: 'functions',
					content: <ContractSection address={address} />,
				},
			]}
			activeSection={activeSection}
			onSectionChange={onSectionChange}
		/>
	)
}

function FilterIndicator(props: {
	account: Address.Address
	tokenAddress: Address.Address
}) {
	const { account, tokenAddress } = props
	return (
		<div className="flex items-center gap-[8px] text-[12px]">
			<span className="text-tertiary">Filtered:</span>
			<Link
				to="/address/$address"
				params={{ address: account }}
				className="text-accent press-down"
				title={account}
			>
				<TruncatedHash hash={account} minChars={8} />
			</Link>
			<Link
				to="/token/$address"
				params={{ address: tokenAddress }}
				className="text-tertiary press-down"
				title="Clear filter"
			>
				<XIcon className="w-[14px] h-[14px] translate-y-px" />
			</Link>
		</div>
	)
}

function ContractSection(props: { address: Address.Address }) {
	const { address } = props
	const contractInfo = getContractInfo(address)

	return (
		<ContractReader
			address={address}
			abi={contractInfo?.abi}
			docsUrl={contractInfo?.docsUrl}
		/>
	)
}
