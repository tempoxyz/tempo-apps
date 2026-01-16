import { useQuery } from '@tanstack/react-query'
import {
	ClientOnly,
	createFileRoute,
	Link,
	notFound,
	stripSearchParams,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as React from 'react'
import { formatUnits } from 'viem'
import { Abis } from 'viem/tempo'
import type { Config } from 'wagmi'
import { getChainId, getPublicClient } from 'wagmi/actions'
import { Actions, Hooks } from 'wagmi/tempo'
import * as z from 'zod/mini'
import { AddressCell } from '#comps/AddressCell'
import { Breadcrumbs } from '#comps/Breadcrumbs'
import { AmountCell, BalanceCell } from '#comps/AmountCell'
import { ContractTabContent, InteractTabContent } from '#comps/Contract.tsx'
import { DataGrid } from '#comps/DataGrid'
import { InfoCard } from '#comps/InfoCard'
import { Midcut } from '#comps/Midcut'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import { TimeColumnHeader, useTimeFormat } from '#comps/TimeFormat'
import { TimestampCell } from '#comps/TimestampCell'
import { TokenIcon } from '#comps/TokenIcon'
import { TransactionCell } from '#comps/TransactionCell'
import { cx } from '#lib/css'
import { ellipsis } from '#lib/chars'
import { getContractInfo } from '#lib/domain/contracts'
import { PriceFormatter } from '#lib/formatting'
import { useCopy, useMediaQuery } from '#lib/hooks'
import { buildTokenDescription, buildTokenOgImageUrl } from '#lib/og'
import {
	firstTransferQueryOptions,
	holdersQueryOptions,
	transfersQueryOptions,
} from '#lib/queries'
import { withLoaderTiming } from '#lib/profiling'
import { fetchOgStats } from '#lib/server/token.server.ts'
import { getWagmiConfig } from '#wagmi.config.ts'
import CopyIcon from '~icons/lucide/copy'
import XIcon from '~icons/lucide/x'

const defaultSearchValues = {
	page: 1,
	limit: 10,
	tab: 'transfers',
} as const

const tabOrder = ['transfers', 'holders', 'contract', 'interact'] as const

const chainId = getChainId(getWagmiConfig())

type TokenMetadata = Actions.token.getMetadata.ReturnValue

export const Route = createFileRoute('/_layout/token/$address')({
	component: RouteComponent,
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Token Not Found"
			message="The token does not exist or could not be found."
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
		tab: z.prefault(
			z.pipe(
				z.string(),
				z.transform((val) => {
					if (
						val === 'transfers' ||
						val === 'holders' ||
						val === 'contract' ||
						val === 'interact'
					)
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
	loader: ({ params }) =>
		withLoaderTiming('/_layout/token/$address', async () => {
			const { address } = params
			if (!Address.validate(address)) throw notFound()

			const config = getWagmiConfig()
			const publicClient = getPublicClient(config)

			// Validate the token exists by fetching metadata (required - blocks render)
			let metadata: Awaited<ReturnType<typeof Actions.token.getMetadata>>
			try {
				metadata = await Actions.token.getMetadata(config as Config, {
					token: address,
				})
			} catch (error) {
				console.error('Failed to fetch token metadata:', error)
				throw notFound()
			}

			// Fast OG stats (threshold-based, not full counts) + currency for OG image
			const [ogStats, currency] = await Promise.all([
				fetchOgStats({ data: { address } }).catch(() => null),
				publicClient
					.readContract({
						address: address,
						abi: Abis.tip20,
						functionName: 'currency',
					})
					.catch(() => undefined),
			])

			// All other data (transfers, holders, firstTransfer) fetched client-side
			return { metadata, ogStats, currency }
		}),
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
	head: ({ params, loaderData }) => {
		const title = `Token ${params.address.slice(0, 6)}…${params.address.slice(-4)} ⋅ Tempo Explorer`
		const metadata = loaderData?.metadata
		const ogStats = loaderData?.ogStats
		const currency = loaderData?.currency

		// Format supply for OG image
		const formatSupply = (totalSupply: bigint, decimals: number): string => {
			const value = Number(formatUnits(totalSupply, decimals))
			if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
			if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
			if (value >= 1e3)
				return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
			return value.toFixed(2)
		}

		const supply =
			metadata?.totalSupply !== undefined && metadata?.decimals !== undefined
				? formatSupply(metadata.totalSupply, metadata.decimals)
				: undefined

		// Format holders count (exact for small counts, threshold for large)
		const formatHolders = (
			holders: { count: number; isExact: boolean } | null | undefined,
		) => {
			if (!holders) return undefined
			return holders.isExact
				? holders.count.toLocaleString()
				: `> ${holders.count.toLocaleString()}`
		}

		const description = buildTokenDescription(
			metadata
				? {
						name: metadata.name ?? '—',
						symbol: metadata.symbol,
						supply,
					}
				: null,
		)

		const ogImageUrl = loaderData
			? buildTokenOgImageUrl({
					address: params.address,
					chainId,
					name: metadata?.name,
					symbol: metadata?.symbol,
					currency,
					holders: formatHolders(ogStats?.holders),
					supply,
					created: ogStats?.created ?? undefined,
				})
			: undefined

		return {
			title,
			meta: [
				{ title },
				{ property: 'og:title', content: title },
				{ property: 'og:description', content: description },
				{ name: 'twitter:description', content: description },
				...(ogImageUrl
					? [
							{ property: 'og:image', content: ogImageUrl },
							{ property: 'og:image:type', content: 'image/webp' },
							{ property: 'og:image:width', content: '1200' },
							{ property: 'og:image:height', content: '630' },
							{ name: 'twitter:card', content: 'summary_large_image' },
							{ name: 'twitter:image', content: ogImageUrl },
						]
					: []),
			],
		}
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

	const activeSection =
		tab === 'holders' ? 1 : tab === 'contract' ? 2 : tab === 'interact' ? 3 : 0

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-3.5 min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-270',
			)}
		>
			<Breadcrumbs className="col-span-full" />
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

	// Fetch first transfer (created date) asynchronously (was prefetched in loader)
	const { data: firstTransferData } = useQuery(
		firstTransferQueryOptions({ address }),
	)

	const { copy, notifying } = useCopy()

	const totalSupply = metadata?.totalSupply
	const totalHolders = holdersSummary?.total
	const holdersCapped = holdersSummary?.totalCapped

	return (
		<InfoCard
			title={
				<div className="flex items-center justify-between px-4.5 pt-2.5 pb-2">
					<h1 className="text-[13px] text-tertiary select-none">Token</h1>
					{metadata?.symbol && (
						<h2 className="text-[13px] inline-flex items-center gap-1.5">
							<TokenIcon
								address={address}
								name={metadata?.symbol}
								className="size-5!"
							/>
							{metadata.symbol}
						</h2>
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
					<div className="flex items-center gap-2 mb-2">
						<span className="text-[13px] font-normal capitalize">Address</span>
						<div className="relative flex items-center">
							<CopyIcon className="w-3 h-3" />
							{notifying && (
								<span className="absolute left-[calc(100%+8px)] text-[13px] leading-4">
									copied
								</span>
							)}
						</div>
					</div>
					<p className="text-[14px] font-mono font-normal leading-4.25 text-primary break-all max-w-[21ch]">
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
							{firstTransferData?.created ? (
								<span className="text-[13px] text-primary">
									{firstTransferData.created}
								</span>
							) : (
								<span className="text-tertiary text-[13px]">{ellipsis}</span>
							)}
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
								<span className="text-[13px] text-primary">
									{holdersCapped ? '100k+' : totalHolders}
								</span>
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

	const { data: transfersData, isPlaceholderData: isTransfersPlaceholder } =
		useQuery(transfersOptions)

	const holdersQueryPage = activeSection === 1 ? page : 1
	const holdersOptions = holdersQueryOptions({
		address,
		page: holdersQueryPage,
		limit,
		offset: activeSection === 1 ? (page - 1) * limit : 0,
	})

	const { data: holdersData, isPlaceholderData: isHoldersPlaceholder } =
		useQuery(holdersOptions)

	const {
		transfers = [],
		total: transfersTotal = 0,
		totalCapped: transfersTotalCapped = false,
	} = transfersData ?? {}

	const {
		holders = [],
		total: holdersTotal = 0,
		totalCapped: holdersTotalCapped = false,
	} = holdersData ?? {}

	const isMobile = useMediaQuery('(max-width: 799px)')

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
			mode={isMobile ? 'stacked' : 'tabs'}
			sections={[
				{
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
				},
				{
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
										metadata?.totalSupply && metadata.totalSupply > 0n
											? Number(
													(BigInt(holder.balance) * 10_000n) /
														metadata.totalSupply,
												) / 100
											: 0
									return {
										cells: [
											<AddressCell key="address" address={holder.address} />,
											<BalanceCell
												key="balance"
												balance={holder.balance}
												decimals={metadata?.decimals}
											/>,
											<span
												key="percentage"
												className="text-[12px] text-primary"
											>
												{percentage.toFixed(2)}%
											</span>,
										],
										link: {
											href: `/token/${address}?a=${holder.address}`,
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
				},
				{
					title: 'Contract',
					totalItems: 0,
					itemsLabel: 'functions',
					content: <ContractSection address={address} />,
				},
				{
					title: 'Interact',
					totalItems: 0,
					itemsLabel: 'functions',
					content: <InteractSection address={address} />,
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
				to="/token/$address"
				params={{ address: tokenAddress }}
				className="text-tertiary press-down"
				title="Clear filter"
			>
				<XIcon className="size-3.5 translate-y-px" />
			</Link>
		</div>
	)
}

function ContractSection(props: { address: Address.Address }) {
	const { address } = props
	const contractInfo = getContractInfo(address)

	return (
		<ContractTabContent
			address={address}
			abi={contractInfo?.abi}
			docsUrl={contractInfo?.docsUrl}
		/>
	)
}

function InteractSection(props: { address: Address.Address }) {
	const { address } = props
	const contractInfo = getContractInfo(address)

	return (
		<InteractTabContent
			address={address}
			abi={contractInfo?.abi}
			docsUrl={contractInfo?.docsUrl}
		/>
	)
}
