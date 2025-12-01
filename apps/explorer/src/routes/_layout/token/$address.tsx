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
import { Abis } from 'tempo.ts/viem'
import { Actions, Hooks } from 'tempo.ts/wagmi'
import { formatUnits } from 'viem'
import * as z from 'zod/mini'
import { ellipsis } from '#chars'
import { DataGrid } from '#components/DataGrid'
import { InfoCard } from '#components/InfoCard'
import { NotFound } from '#components/NotFound'
import { RelativeTime } from '#components/RelativeTime'
import { Sections } from '#components/Sections'
import { cx } from '#cva.config.ts'
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

const tabOrder = ['transfers', 'holders', 'contract'] as const

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

type TokenMetadata = Actions.token.getMetadata.ReturnValue

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

function TokenCard(props: {
	address: Address.Address
	className?: string
	initialMetadata?: TokenMetadata
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

	const contractColumns: DataGrid.Column[] = [
		{ label: 'Field', align: 'start', minWidth: 140 },
		{ label: 'Value', align: 'start', minWidth: 160 },
	]

	const contractSkeletonFields = [
		'Address',
		'Name',
		'Symbol',
		'Currency',
		'Decimals',
		'Status',
	] as const

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
					itemsLabel: 'fields',
					content: (
						<DataGrid
							columns={{
								stacked: contractColumns,
								tabs: contractColumns,
							}}
							items={() =>
								contractSkeletonFields.map((field) => ({
									cells: [
										<div key={`${field}-label`} className="h-5" />,
										<div key={`${field}-value`} className="h-5" />,
									],
								}))
							}
							totalItems={0}
							page={1}
							isPending={false}
							itemsLabel="fields"
							itemsPerPage={contractSkeletonFields.length}
							pagination="simple"
						/>
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

	const state = useRouterState()
	const loaderData = Route.useLoaderData()

	const { data: metadata, isPending: isMetadataPending } =
		Hooks.token.useGetMetadata({
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

	const { data: holdersData, isLoading: isLoadingHolders } = useQuery({
		...holdersOptions,
		...(activeSection === 1 && holdersQueryPage === page && loaderData.holders
			? { initialData: loaderData.holders }
			: {}),
	})

	const { transfers = [], total: transfersTotal = 0 } = transfersData ?? {}

	const { holders = [], total: holdersTotal = 0 } = holdersData ?? {}

	const routeIsLoading =
		state.isLoading && state.location.pathname.includes('/token/')
	const transfersPending = routeIsLoading || isLoadingTransfers
	const holdersPending = routeIsLoading || isLoadingHolders
	const contractPending = routeIsLoading || isMetadataPending

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	if (transfers.length === 0 && transfersPending && activeSection === 0)
		return <SectionsSkeleton totalItems={transfersTotal} />

	const contractFields = buildContractFields({ address, metadata })

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
										<AddressLink key="to" address={transfer.to} label="To" />,
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
							isPending={transfersPending}
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
								stacked: holdersColumns,
								tabs: holdersColumns,
							}}
							items={() =>
								holders.map((holder) => ({
									cells: [
										<AddressLink key="address" address={holder.address} />,
										<HolderBalance
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
						/>
					),
				},
				{
					title: 'Contract',
					totalItems: contractFields.length,
					itemsLabel: 'fields',
					content: (
						<ContractSection
							address={address}
							metadata={metadata}
							fields={contractFields}
							isLoading={contractPending}
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
				<XIcon className="w-[14px] h-[14px] translate-y-px" />
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

type ContractField = {
	key: string
	label: string
	value: React.ReactNode
}

function buildContractFields(props: {
	address: Address.Address
	metadata?: TokenMetadata
}): ContractField[] {
	const { address, metadata } = props
	const placeholder = (
		<span className="text-tertiary text-[13px]">{ellipsis}</span>
	)

	const decimals = metadata?.decimals
	const symbol = metadata?.symbol

	const formatTokenValue = (value?: bigint): React.ReactNode => {
		if (value === undefined || decimals === undefined) return placeholder
		const formatted = formatUnits(value, decimals)
		const amount = PriceFormatter.formatAmount(formatted)
		return (
			<span
				className="text-[13px]"
				title={`${formatted} ${symbol ?? ''}`.trim()}
			>
				{amount}
				{symbol ? ` ${symbol}` : ''}
			</span>
		)
	}

	const safeQuoteToken =
		metadata?.quoteToken && Address.validate(metadata.quoteToken)
			? (metadata.quoteToken as Address.Address)
			: undefined

	const quoteTokenValue = safeQuoteToken ? (
		<Link
			to="/token/$address"
			params={{ address: safeQuoteToken }}
			className="text-[13px] text-accent hover:text-accent/80 transition-colors press-down"
			title={`View token ${safeQuoteToken}`}
		>
			{HexFormatter.truncate(safeQuoteToken, 8)}
		</Link>
	) : null

	const ensureValue = (value: React.ReactNode): React.ReactNode => {
		if (
			value === undefined ||
			value === null ||
			(typeof value === 'string' && value.trim() === '')
		)
			return placeholder
		return value
	}

	const statusValue =
		metadata?.paused === undefined ? null : metadata.paused ? (
			<span className="text-tertiary">Paused</span>
		) : (
			<span className="text-accent">Active</span>
		)

	return [
		{
			key: 'address',
			label: 'Address',
			value: <AddressLink address={address} />,
		},
		{
			key: 'name',
			label: 'Name',
			value: metadata?.name,
		},
		{
			key: 'symbol',
			label: 'Symbol',
			value: metadata?.symbol,
		},
		{
			key: 'currency',
			label: 'Currency',
			value: metadata?.currency?.toUpperCase(),
		},
		{
			key: 'decimals',
			label: 'Decimals',
			value:
				metadata?.decimals !== undefined
					? metadata.decimals.toLocaleString()
					: null,
		},
		{
			key: 'status',
			label: 'Status',
			value: statusValue,
		},
		{
			key: 'total-supply',
			label: 'Total Supply',
			value: formatTokenValue(metadata?.totalSupply),
		},
		{
			key: 'supply-cap',
			label: 'Supply Cap',
			value:
				metadata?.supplyCap !== undefined
					? formatTokenValue(metadata.supplyCap)
					: null,
		},
		{
			key: 'quote-token',
			label: 'Quote Token',
			value: quoteTokenValue,
		},
		{
			key: 'transfer-policy',
			label: 'Transfer Policy',
			value:
				metadata?.transferPolicyId !== undefined
					? `Policy #${metadata.transferPolicyId.toString()}`
					: null,
		},
	].map((field) => ({
		...field,
		value: ensureValue(field.value),
	}))
}

function ContractSection(props: {
	address: Address.Address
	metadata?: TokenMetadata
	fields: ContractField[]
	isLoading?: boolean
}) {
	const { address, metadata, isLoading } = props
	const { copy: copyAbi, notifying: copiedAbi } = useCopy()
	const abi = React.useMemo(() => JSON.stringify(Abis.tip20 ?? [], null, 2), [])

	const handleCopyAbi = React.useCallback(() => {
		void copyAbi(abi)
	}, [abi, copyAbi])

	const handleDownloadAbi = React.useCallback(() => {
		if (typeof window === 'undefined') return
		const blob = new Blob([abi], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `${address}-tip20-abi.json`
		document.body.appendChild(anchor)
		anchor.click()
		document.body.removeChild(anchor)
		URL.revokeObjectURL(url)
	}, [abi, address])

	return (
		<div className="flex flex-col gap-1">
			<AbiViewer
				abi={abi}
				onCopy={handleCopyAbi}
				onDownload={handleDownloadAbi}
				copied={copiedAbi}
			/>
			<ReadContractPanel
				address={address}
				metadata={metadata}
				isLoading={isLoading}
			/>
		</div>
	)
}

function ContractFeatureCard(props: {
	title: string
	description?: React.ReactNode
	actions?: React.ReactNode
	children: React.ReactNode
}) {
	const { title, description, actions, children } = props
	return (
		<section className="rounded-[10px] bg-card-header overflow-hidden">
			<div className="flex flex-col gap-[6px] px-[18px] py-[12px] sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-[13px] uppercase text-tertiary">{title}</p>
					{description && (
						<p className="text-[12px] text-tertiary/80">{description}</p>
					)}
				</div>
				{actions}
			</div>
			<div className="border-t border-card-border bg-card px-[18px] py-[14px]">
				{children}
			</div>
		</section>
	)
}

function AbiViewer(props: {
	abi: string
	onCopy: () => void
	onDownload: () => void
	copied: boolean
}) {
	const { abi, onCopy, onDownload, copied } = props
	return (
		<ContractFeatureCard
			title="Contract ABI"
			description="Shareable interface definition for read/write tooling."
			actions={
				<div className="flex gap-[8px]">
					<button
						type="button"
						onClick={onCopy}
						className="text-[12px] rounded-[6px] border border-card-border px-[10px] py-[6px] hover:bg-base-alt transition-colors"
					>
						{copied ? 'Copied' : 'Copy JSON'}
					</button>
					<button
						type="button"
						onClick={onDownload}
						className="text-[12px] rounded-[6px] border border-card-border px-[10px] py-[6px] hover:bg-base-alt transition-colors"
					>
						Download
					</button>
				</div>
			}
		>
			<pre className="max-h-[280px] overflow-auto rounded-[8px] text-[12px] leading-[18px] text-primary/90">
				{abi}
			</pre>
		</ContractFeatureCard>
	)
}

function ReadContractPanel(props: {
	address: Address.Address
	metadata?: TokenMetadata
	isLoading?: boolean
}) {
	const { address, metadata, isLoading } = props
	const safeQuoteToken =
		metadata?.quoteToken && Address.validate(metadata.quoteToken)
			? (metadata.quoteToken as Address.Address)
			: undefined

	const readRows: Array<{
		key: string
		label: string
		value?: React.ReactNode
	}> = [
		{ key: 'name', label: 'name()', value: metadata?.name },
		{ key: 'symbol', label: 'symbol()', value: metadata?.symbol },
		{
			key: 'decimals',
			label: 'decimals()',
			value: metadata?.decimals?.toLocaleString(),
		},
		{
			key: 'totalSupply',
			label: 'totalSupply()',
			value: formatTokenAmount(
				metadata?.totalSupply,
				metadata?.decimals,
				metadata?.symbol,
			),
		},
		{
			key: 'currency',
			label: 'currency()',
			value: metadata?.currency?.toUpperCase(),
		},
		{
			key: 'quoteToken',
			label: 'quoteToken()',
			value: safeQuoteToken ? (
				<AddressLink address={safeQuoteToken} />
			) : undefined,
		},
		{
			key: 'paused',
			label: 'paused()',
			value:
				metadata?.paused === undefined
					? undefined
					: metadata.paused
						? 'true'
						: 'false',
		},
		{
			key: 'transferPolicy',
			label: 'transferPolicyId()',
			value: metadata?.transferPolicyId?.toString(),
		},
	]

	return (
		<ContractFeatureCard
			title="Read contract"
			description="Call view methods exactly like Etherscan."
		>
			<div className="flex flex-col gap-[12px]">
				{readRows.map((row) => (
					<ReadFixedValue
						key={row.key}
						label={row.label}
						value={row.value}
						isLoading={isLoading}
					/>
				))}
				<ReadBalanceFunction
					address={address}
					decimals={metadata?.decimals}
					symbol={metadata?.symbol}
				/>
				<ReadAllowanceFunction
					address={address}
					decimals={metadata?.decimals}
					symbol={metadata?.symbol}
				/>
			</div>
		</ContractFeatureCard>
	)
}

function ReadFixedValue(props: {
	label: string
	value?: React.ReactNode
	isLoading?: boolean
}) {
	const { label, value, isLoading } = props
	return (
		<div className="flex flex-col gap-[4px] rounded-[8px] border border-dashed border-card-border px-[12px] py-[10px]">
			<span className="text-[12px] uppercase text-tertiary">{label}</span>
			<span className="text-[13px] text-primary">
				{isLoading ? ellipsis : (value ?? ellipsis)}
			</span>
		</div>
	)
}

function ReadBalanceFunction(props: {
	address: Address.Address
	decimals?: number
	symbol?: string
}) {
	const { address, decimals, symbol } = props
	const [input, setInput] = React.useState('')
	const inputId = React.useId()
	const normalized = React.useMemo(() => normalizeAddress(input), [input])
	const { data: balance, isFetching } = Hooks.token.useGetBalance({
		token: address,
		account: normalized,
		query: {
			enabled: Boolean(normalized),
		},
	})

	let message: React.ReactNode = 'Enter an address to fetch the balance.'
	if (input.trim().length > 0 && !normalized) message = 'Invalid address.'
	else if (isFetching) message = 'Loading balance…'
	else if (normalized && balance !== undefined && balance !== null)
		message = formatTokenAmount(balance, decimals, symbol)

	return (
		<div className="flex flex-col gap-[6px] rounded-[8px] border border-dashed border-card-border px-[12px] py-[10px]">
			<label className="text-[12px] uppercase text-tertiary" htmlFor={inputId}>
				balanceOf
			</label>
			<input
				id={inputId}
				value={input}
				onChange={(event) => setInput(event.target.value)}
				placeholder="0x..."
				className="w-full rounded-[6px] border border-base-border bg-card px-[10px] py-[6px] text-[13px] text-primary placeholder:text-tertiary focus-visible:outline-1 focus-visible:outline-accent"
			/>
			<span className="text-[12px] text-tertiary">{message}</span>
		</div>
	)
}

function ReadAllowanceFunction(props: {
	address: Address.Address
	decimals?: number
	symbol?: string
}) {
	const { address, decimals, symbol } = props
	const [ownerInput, setOwnerInput] = React.useState('')
	const [spenderInput, setSpenderInput] = React.useState('')
	const ownerId = React.useId()
	const spenderId = React.useId()

	const owner = React.useMemo(() => normalizeAddress(ownerInput), [ownerInput])
	const spender = React.useMemo(
		() => normalizeAddress(spenderInput),
		[spenderInput],
	)

	const { data: allowance, isFetching } = Hooks.token.useGetAllowance({
		token: address,
		account: owner,
		spender,
		query: {
			enabled: Boolean(owner && spender),
		},
	})

	let message: React.ReactNode =
		'Enter owner + spender addresses to fetch allowance.'
	if (
		(ownerInput.trim().length > 0 && !owner) ||
		(spenderInput.trim().length > 0 && !spender)
	)
		message = 'Addresses must be valid hex strings.'
	else if (isFetching) message = 'Loading allowance…'
	else if (owner && spender && allowance !== undefined && allowance !== null)
		message = formatTokenAmount(allowance, decimals, symbol)

	return (
		<div className="flex flex-col gap-[6px] rounded-[8px] border border-dashed border-card-border px-[12px] py-[10px]">
			<span className="text-[12px] uppercase text-tertiary">allowance</span>
			<label className="text-[11px] text-tertiary" htmlFor={ownerId}>
				Owner
			</label>
			<input
				id={ownerId}
				value={ownerInput}
				onChange={(event) => setOwnerInput(event.target.value)}
				placeholder="Owner address"
				className="w-full rounded-[6px] border border-base-border bg-card px-[10px] py-[6px] text-[13px] text-primary placeholder:text-tertiary focus-visible:outline-1 focus-visible:outline-accent"
			/>
			<label className="text-[11px] text-tertiary" htmlFor={spenderId}>
				Spender
			</label>
			<input
				id={spenderId}
				value={spenderInput}
				onChange={(event) => setSpenderInput(event.target.value)}
				placeholder="Spender address"
				className="w-full rounded-[6px] border border-base-border bg-card px-[10px] py-[6px] text-[13px] text-primary placeholder:text-tertiary focus-visible:outline-1 focus-visible:outline-accent"
			/>
			<span className="text-[12px] text-tertiary">{message}</span>
		</div>
	)
}

function normalizeAddress(value: string): Address.Address | undefined {
	const trimmed = value.trim()
	if (!trimmed) return undefined
	try {
		Address.assert(trimmed)
		return trimmed
	} catch {
		return undefined
	}
}

function formatTokenAmount(
	value?: bigint | null,
	decimals?: number,
	symbol?: string,
) {
	if (value === undefined || value === null || decimals === undefined)
		return ellipsis
	const formatted = formatUnits(value, decimals)
	const amount = PriceFormatter.formatAmount(formatted)
	return symbol ? `${amount} ${symbol}` : amount
}
