import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import {
	ClientOnly,
	createFileRoute,
	Link,
	notFound,
	stripSearchParams,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { Address, type Hex } from 'ox'
import * as React from 'react'
import { Actions, Hooks } from 'tempo.ts/wagmi'
import { formatUnits } from 'viem'
import * as z from 'zod/mini'
import { ellipsis } from '#chars'
import { DataGrid } from '#components/DataGrid'
import { InfoCard } from '#components/InfoCard'
import { NotFound } from '#components/NotFound'
import { RelativeTime } from '#components/RelativeTime'
import { Sections } from '#components/Sections'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { useCopy, useMediaQuery } from '#lib/hooks'
import { fetchHolders, fetchTransfers } from '#lib/token.server'
import { config } from '#wagmi.config'
import CopyIcon from '~icons/lucide/copy'
import XIcon from '~icons/lucide/x'

const defaultSearchValues = {
	page: 1,
	limit: 10,
	tab: 'transfers',
} as const

type TransfersQuery = {
	address: Address.Address
	page: number
	limit: number
	offset: number
	account?: Address.Address | undefined
	_key?: string | undefined
}

type HoldersQuery = {
	address: Address.Address
	page: number
	limit: number
	offset: number
}

function transfersQueryOptions(params: TransfersQuery) {
	return queryOptions({
		queryKey: [
			'token-transfers',
			params.address,
			params.page,
			params.limit,
			params.account,
			params._key,
		],
		queryFn: async () => {
			const data = await fetchTransfers({
				data: {
					address: params.address,
					offset: params.offset,
					limit: params.limit,
					account: params.account,
				},
			})
			return data
		},
		placeholderData: keepPreviousData,
	})
}

function holdersQueryOptions(params: HoldersQuery) {
	return queryOptions({
		queryKey: ['token-holders', params.address, params.page, params.limit],
		queryFn: async () => {
			const data = await fetchHolders({
				data: {
					address: params.address,
					offset: params.offset,
					limit: params.limit,
				},
			})
			return data
		},
		placeholderData: keepPreviousData,
	})
}

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
					if (val === 'transfers' || val === 'holders') return val
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

		const holdersSummary = await context.queryClient.fetchQuery(
			holdersQueryOptions({ address, page: 1, limit: 10, offset: 0 }),
		)

		if (tab === 'transfers') {
			const [metadata, transfers] = await Promise.all([
				Actions.token.getMetadata(config, { token: address }),
				context.queryClient.fetchQuery(
					transfersQueryOptions({ address, page, limit, offset, account }),
				),
			])
			return { holders: undefined, holdersSummary, metadata, transfers }
		}

		const [metadata, holders] = await Promise.all([
			Actions.token.getMetadata(config, { token: address }),
			context.queryClient.fetchQuery(
				holdersQueryOptions({ address, page, limit, offset }),
			),
		])
		return { holders, holdersSummary, metadata, transfers: undefined }
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

function TokenCard(props: {
	address: Address.Address
	className?: string
	initialMetadata?: Actions.token.getMetadata.ReturnValue
	holdersSummary?: {
		holders: Array<{
			address: Address.Address
			balance: string
			percentage: number
		}>
		total: number
		totalSupply: string
		offset: number
		limit: number
	}
}) {
	const { address, className, initialMetadata, holdersSummary } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: address,
		query: {
			enabled: Boolean(address),
			initialData: initialMetadata,
		},
	})

	const { copy, notifying } = useCopy()

	const totalSupply = holdersSummary?.totalSupply
		? BigInt(holdersSummary.totalSupply)
		: undefined
	const totalHolders = holdersSummary?.total

	return (
		<InfoCard
			title="Token"
			secondary={metadata?.symbol}
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
	const isMobile = useMediaQuery('(max-width: 1239px)')
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
								stacked: [
									{ label: 'Time', align: 'start', minWidth: 100 },
									{ label: 'From', align: 'start' },
									{ label: 'To', align: 'start' },
								],
								tabs: [
									{ label: 'Time', align: 'start', minWidth: 100 },
									{ label: 'Transaction', align: 'start' },
									{ label: 'From', align: 'start' },
									{ label: 'To', align: 'start' },
									{ label: 'Amount', align: 'end' },
								],
							}}
							items={() =>
								Array.from(
									{ length: defaultSearchValues.limit },
									(_, index) => {
										const key = `skeleton-${index}`
										return {
											cells: [
												<div key={`${key}-time`} className="h-5" />,
												<div key={`${key}-from`} className="h-5" />,
												<div key={`${key}-to`} className="h-5" />,
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
								stacked: [
									{ label: 'Address', align: 'start' },
									{ label: 'Balance', align: 'end' },
								],
								tabs: [
									{ label: 'Address', align: 'start' },
									{ label: 'Balance', align: 'end' },
									{ label: 'Percentage', align: 'end' },
								],
							}}
							items={() => []}
							totalItems={0}
							page={1}
							isPending={false}
							itemsLabel="holders"
						/>
					),
				},
			]}
			activeSection={0}
			onSectionChange={() => {}}
		/>
	)
}

function RouteComponent() {
	const navigate = useNavigate()
	const route = useRouter()
	const { address } = Route.useParams()
	const { page, tab, limit, a } = Route.useSearch()
	const loaderData = Route.useLoaderData()

	Address.assert(address)

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
			const tabs = ['transfers', 'holders'] as const
			const newTab = tabs[newIndex] || 'transfers'
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

	const activeSection = tab === 'transfers' ? 0 : 1

	return (
		<div className="flex flex-col min-[1240px]:grid max-w-[1080px] w-full min-[1240px]:pt-20 pt-10 min-[1240px]:pb-16 pb-8 px-4 gap-[14px] min-w-0 min-[1240px]:grid-cols-[auto_1fr]">
			<TokenCard
				address={address}
				className="self-start"
				initialMetadata={loaderData.metadata}
				holdersSummary={loaderData.holdersSummary}
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

	const state = useRouterState()
	const loaderData = Route.useLoaderData()

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: address,
		query: {
			enabled: Boolean(address),
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

	const { data: holdersData, isLoading: isLoadingHolders } = useQuery({
		...holdersOptions,
		...(activeSection === 1 && holdersQueryPage === page && loaderData.holders
			? { initialData: loaderData.holders }
			: {}),
	})

	const { transfers = [], total: transfersTotal = 0 } = transfersData ?? {}

	const { holders = [], total: holdersTotal = 0 } = holdersData ?? {}

	const isLoadingPage =
		(state.isLoading && state.location.pathname.includes('/token/')) ||
		isLoadingTransfers ||
		isLoadingHolders

	const isMobile = useMediaQuery('(max-width: 1239px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	if (transfers.length === 0 && isLoadingPage && activeSection === 0)
		return <SectionsSkeleton totalItems={transfersTotal} />

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
								stacked: [
									{ label: 'Time', align: 'start', minWidth: 100 },
									{ label: 'From', align: 'start' },
									{ label: 'To', align: 'start' },
								],
								tabs: [
									{ label: 'Time', align: 'start', minWidth: 100 },
									{ label: 'Transaction', align: 'start' },
									{ label: 'From', align: 'start' },
									{ label: 'To', align: 'start' },
									{ label: 'Amount', align: 'end' },
								],
							}}
							items={(mode) => {
								const validTransfers = transfers.filter(
									(t): t is typeof t & { timestamp: string; value: string } =>
										t.timestamp !== null && t.value !== null,
								)

								return validTransfers.map((transfer) => ({
									cells:
										mode === 'stacked'
											? [
													<TransferTime
														key="time"
														timestamp={BigInt(transfer.timestamp)}
														link={`/tx/${transfer.transactionHash}`}
													/>,
													<AddressLink
														key="from"
														address={transfer.from}
														label="From"
													/>,
													<AddressLink
														key="to"
														address={transfer.to}
														label="To"
													/>,
												]
											: [
													<TransferTime
														key="time"
														timestamp={BigInt(transfer.timestamp)}
														link={`/tx/${transfer.transactionHash}`}
													/>,
													<TransactionLink
														key="tx"
														hash={transfer.transactionHash}
													/>,
													<AddressLink
														key="from"
														address={transfer.from}
														label="From"
													/>,
													<AddressLink
														key="to"
														address={transfer.to}
														label="To"
													/>,
													<TransferAmount
														key="amount"
														value={BigInt(transfer.value)}
														decimals={metadata?.decimals}
														symbol={metadata?.symbol}
													/>,
												],
									link: {
										href: `/tx/${transfer.transactionHash}`,
										title: `View receipt ${transfer.transactionHash}`,
									},
								}))
							}}
							totalItems={transfersTotal}
							page={page}
							isPending={isLoadingPage}
							itemsLabel="transfers"
							itemsPerPage={limit}
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
								stacked: [
									{ label: 'Address', align: 'start' },
									{ label: 'Balance', align: 'end' },
								],
								tabs: [
									{ label: 'Address', align: 'start' },
									{ label: 'Balance', align: 'end' },
									{ label: 'Percentage', align: 'end' },
								],
							}}
							items={(mode) =>
								holders.map((holder) => ({
									cells:
										mode === 'stacked'
											? [
													<AddressLink
														key="address"
														address={holder.address}
													/>,
													<HolderBalance
														key="balance"
														balance={holder.balance}
														decimals={metadata?.decimals}
													/>,
												]
											: [
													<AddressLink
														key="address"
														address={holder.address}
													/>,
													<HolderBalance
														key="balance"
														balance={holder.balance}
														decimals={metadata?.decimals}
													/>,
													<span
														key="percentage"
														className="text-[12px] text-primary"
													>
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
							isPending={isLoadingPage}
							itemsLabel="holders"
							itemsPerPage={limit}
						/>
					),
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
				{HexFormatter.truncate(account, 8)}
			</Link>
			<Link
				to="/token/$address"
				params={{ address: tokenAddress }}
				className="text-tertiary press-down"
				title="Clear filter"
			>
				<XIcon className="w-[14px] h-[14px] translate-y-[1px]" />
			</Link>
		</div>
	)
}

function TransferTime(props: { timestamp: bigint; link?: string }) {
	const { timestamp, link } = props
	return (
		<div className="text-nowrap">
			{link ? (
				<Link to={link} className="text-tertiary hover:text-secondary">
					<RelativeTime timestamp={timestamp} />
				</Link>
			) : (
				<RelativeTime timestamp={timestamp} className="text-tertiary" />
			)}
		</div>
	)
}

function TransactionLink(props: { hash: Hex.Hex }) {
	const { hash } = props
	return (
		<Link
			to="/tx/$hash"
			params={{ hash }}
			className="text-[13px] text-tertiary press-down inline-flex items-center gap-1"
			title={hash}
		>
			{HexFormatter.truncate(hash, 6)}
		</Link>
	)
}

function AddressLink(props: {
	address: Address.Address
	label?: string
	asLink?: boolean
}) {
	const { address, label, asLink = true } = props
	const content = HexFormatter.truncate(address, 8)
	const title = `${label ? `${label}: ` : ''}${address}`

	if (!asLink)
		return (
			<span className="text-[13px] text-accent" title={title}>
				{content}
			</span>
		)

	return (
		<Link
			to="/address/$address"
			params={{ address }}
			className="text-[13px] text-accent hover:text-accent/80 transition-colors press-down"
			title={title}
		>
			{content}
		</Link>
	)
}

function TransferAmount(props: {
	value: bigint
	decimals?: number
	symbol?: string
}) {
	const { value, decimals = 18, symbol } = props
	const formatted = PriceFormatter.formatAmount(formatUnits(value, decimals))
	return (
		<span className="text-[12px] text-primary">
			{formatted} {symbol}
		</span>
	)
}

function HolderBalance(props: { balance: string; decimals?: number }) {
	const { balance, decimals = 18 } = props
	const formatted = PriceFormatter.formatAmount(
		formatUnits(BigInt(balance), decimals),
	)
	return <span className="text-[12px] text-primary">{formatted}</span>
}
