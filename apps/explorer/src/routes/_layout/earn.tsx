import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
} from '@tanstack/react-router'
import {
	Alert,
	Container,
	Empty,
	Grid,
	Inline,
	Skeleton,
	Stack,
	StatusIndicator,
	Surface,
	Switch,
	style,
	Table,
	Tabs,
	TokenLogo,
} from '@tempoxyz/ds'
import { useMemo } from 'react'
import type * as React from 'react'
import { Address } from '#comps/Address'
import {
	defaultEarnSearch,
	type EarnSearch,
	type EarnSort,
	type EarnVault,
	earnSearchSchema,
	earnTotals,
	engineLabels,
	filterVaults,
	sortVaults,
	vaultAssets,
} from '#lib/earn'
import { PriceFormatter } from '#lib/formatting'
import { useRowLink } from '#lib/hooks'
import { earnVaultsQueryOptions } from '#lib/queries/earn'

export const Route = createFileRoute('/_layout/earn')({
	component: EarnPage,
	validateSearch: earnSearchSchema,
	search: { middlewares: [stripSearchParams(defaultEarnSearch)] },
	head: () => ({ meta: [{ title: 'Earn – Tempo Explorer' }] }),
	loader: async ({ context }) => {
		await Promise.race([
			context.queryClient.prefetchQuery(earnVaultsQueryOptions()),
			new Promise((resolve) => setTimeout(resolve, LOADER_WAIT)),
		])
	},
})

/** How long navigation waits for data before showing the page without it. */
const LOADER_WAIT = 300
const LOADING_ROWS = 5

const cents = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
})
const usd = (value: number) =>
	value < 1000
		? cents.format(value)
		: PriceFormatter.format(value, { format: 'short' })
const percent = new Intl.NumberFormat('en-US', {
	style: 'percent',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
})
const sharePrice = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
})

namespace styles {
	export const page = style({
		boxSizing: 'border-box',
		width: '100% !custom',
		minWidth: '0',
		paddingBlockStart: '24',
		'@media (min-width: 768px)': { paddingBlockStart: '48' },
		paddingBlockEnd: '64',
		color: 'content.primary',
		typography: 'body.b2',
	})
	export const header = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		minWidth: '0',
	})
	export const title = style({
		color: 'content.primary',
		margin: '0',
		typography: 'heading.h2',
	})
	export const intro = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'body.b2',
	})
	export const statLabel = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'body.b2',
	})
	export const statValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'heading.h2',
	})
	export const bar = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		justifyContent: 'space-between',
		minWidth: '0',
	})
	export const assets = style({ minWidth: '0', maxWidth: '100% !custom' })
	export const toggle = style({
		alignItems: 'center',
		color: 'content.secondary',
		cursor: 'pointer',
		display: 'inline-flex',
		gap: '8',
		typography: 'body.b2',
		whiteSpace: 'nowrap',
	})
	export const scroll = style({ overflowX: 'auto', minWidth: '0' })
	export const muted = style({ color: 'content.tertiary' })
	export const secondary = style({ color: 'content.secondary' })
	export const strong = style({ typography: 'body.b2Strong' })
	export const nowrap = style({ whiteSpace: 'nowrap' })
	export const subtitle = style({
		alignItems: 'center',
		display: 'flex',
		gap: '6',
		whiteSpace: 'nowrap',
	})
	export const link = style({
		color: 'inherit !custom',
		textDecoration: 'none !custom',
	})
	export const wide = style({
		'@media (max-width: 639px)': { display: 'none !custom' },
	})
	export const card = style({
		'@media (max-width: 639px)': { paddingInline: '16' },
	})
}

function EarnPage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const query = useQuery(earnVaultsQueryOptions())
	const failed = query.isError && !query.data

	const listed = useMemo(
		() =>
			filterVaults(query.data?.vaults ?? [], {
				asset: 'all',
				unverified: search.unverified,
			}),
		[query.data, search.unverified],
	)
	const assets = useMemo(() => vaultAssets(listed), [listed])
	const asset = assets.includes(search.asset) ? search.asset : 'all'
	const rows = useMemo(
		() =>
			sortVaults(
				filterVaults(listed, { asset, unverified: true }),
				search.sort,
				search.dir,
			),
		[listed, asset, search.sort, search.dir],
	)
	const totals = useMemo(() => earnTotals(rows), [rows])
	const pending = query.isPending

	function setSearch(next: Partial<EarnSearch>) {
		void navigate({
			search: (previous) => ({ ...previous, ...next }),
			replace: true,
			resetScroll: false,
		})
	}

	function sortBy(sort: EarnSort) {
		setSearch({
			sort,
			dir: search.sort === sort && search.dir === 'desc' ? 'asc' : 'desc',
		})
	}

	return (
		<div {...styles.page()}>
			<Container size="wide">
				<Stack gap="32">
					<div {...styles.header()}>
						<h1 {...styles.title()}>Earn</h1>
						<p {...styles.intro()}>
							Every Tempo Earn vault deployed onchain, by asset and engine. APY
							is net of fees, from share-price growth over the last 7 days.
						</p>
					</div>

					<Grid fit="medium" gap="16" render={<section aria-label="Totals" />}>
						<Stat
							label="Total value locked"
							value={pending || failed ? undefined : usd(totals.tvl)}
							partial={query.data?.complete === false}
						/>
						<Stat
							label="Funded vaults"
							value={pending || failed ? undefined : String(totals.funded)}
							partial={query.data?.complete === false}
						/>
						<Stat
							label="Average APY (by TVL)"
							value={
								pending || failed
									? undefined
									: totals.apy === null
										? '—'
										: percent.format(totals.apy)
							}
						/>
					</Grid>

					<Stack gap="16">
						<div {...styles.bar()}>
							<Tabs.Root
								value={asset}
								onValueChange={(value) => setSearch({ asset: String(value) })}
								{...styles.assets()}
							>
								<Tabs.List variant="pill" size="small" aria-label="Asset">
									<Tabs.Tab value="all">All</Tabs.Tab>
									{assets.map((symbol) => (
										<Tabs.Tab key={symbol} value={symbol}>
											{symbol}
										</Tabs.Tab>
									))}
								</Tabs.List>
							</Tabs.Root>
							{/* biome-ignore lint/a11y/noLabelWithoutControl: Base UI's Switch renders its input inside the label. */}
							<label {...styles.toggle()}>
								<Switch
									size="small"
									checked={!search.unverified}
									onCheckedChange={(checked) =>
										setSearch({ unverified: !checked })
									}
								/>
								Verified only
							</label>
						</div>

						<Surface size="medium" {...styles.card()}>
							<Stack gap="16">
								{failed && (
									<Alert intent="negative">
										<Alert.Icon />
										<Alert.Content>
											<Alert.Title>Earn vaults unavailable</Alert.Title>
											{query.error?.message ?? 'Unavailable.'}
											<Alert.Action
												disabled={query.isFetching}
												onClick={() => void query.refetch()}
											>
												{query.isFetching ? 'Retrying…' : 'Try again'}
											</Alert.Action>
										</Alert.Content>
									</Alert>
								)}
								{query.data?.complete === false && (
									<Alert intent="warning">
										<Alert.Icon />
										<Alert.Content>
											<Alert.Title>Some vaults couldn’t be read</Alert.Title>
											Totals are a lower bound until they load.
										</Alert.Content>
									</Alert>
								)}
								<VaultsTable
									rows={rows}
									loading={rows.length === 0 && pending}
									hasErrors={failed}
									search={search}
									onSort={sortBy}
								/>
							</Stack>
						</Surface>
					</Stack>
				</Stack>
			</Container>
		</div>
	)
}

export function VaultsTable(
	props: VaultsTable.Props,
): React.JSX.Element | null {
	const { rows, loading, hasErrors, search, onSort } = props
	const rowLink = useRowLink()
	if (!loading && rows.length === 0)
		return hasErrors ? null : (
			<Empty.Root>
				<Empty.Title>No vaults</Empty.Title>
			</Empty.Root>
		)

	const sortable = (sort: EarnSort, label: string, title?: string) => (
		<Table.HeaderCell
			justify="end"
			title={title}
			aria-sort={
				search.sort === sort
					? search.dir === 'asc'
						? 'ascending'
						: 'descending'
					: undefined
			}
		>
			<Table.SortButton
				onClick={() => onSort(sort)}
				aria-label={`Sort by ${label}`}
			>
				{label}
			</Table.SortButton>
		</Table.HeaderCell>
	)

	return (
		<div {...styles.scroll()}>
			<Table interactive aria-label="Earn vaults">
				<Table.Head>
					<Table.Row>
						<Table.HeaderCell>Vault</Table.HeaderCell>
						<Table.HeaderCell {...styles.wide()}>Address</Table.HeaderCell>
						{sortable('tvl', 'TVL', 'Total assets in US dollars.')}
						{sortable(
							'apy',
							'APY',
							'Net of fees, annualized from share-price growth over the last 7 days.',
						)}
						<Table.HeaderCell justify="end" {...styles.wide()}>
							Share price
						</Table.HeaderCell>
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{rows.map((vault) => (
						<Table.Row
							key={vault.address}
							{...rowLink(`/address/${vault.address}`)}
						>
							<Table.Cell>
								<VaultLabel vault={vault} />
							</Table.Cell>
							<Table.Cell {...styles.wide()}>
								<Address address={vault.address} chars={4} />
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{vault.tvl === null ? <Dash /> : usd(vault.tvl)}
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{vault.apy === null ? <Dash /> : percent.format(vault.apy)}
							</Table.Cell>
							<Table.Cell justify="end" numeric {...styles.wide()}>
								{vault.sharePrice === null ? (
									<Dash />
								) : (
									<span {...styles.secondary()}>
										{sharePrice.format(vault.sharePrice)}
									</span>
								)}
							</Table.Cell>
						</Table.Row>
					))}
					{loading &&
						Array.from({ length: LOADING_ROWS }, (_, index) => (
							<Table.Row key={index} aria-busy="true">
								{Array.from({ length: 5 }, (_, cell) => (
									<Table.Cell
										key={cell}
										{...(cell === 1 || cell === 4 ? styles.wide() : {})}
									>
										<Skeleton>
											<span>Loading value</span>
										</Skeleton>
									</Table.Cell>
								))}
							</Table.Row>
						))}
				</Table.Body>
			</Table>
		</div>
	)
}

export declare namespace VaultsTable {
	type Props = {
		rows: EarnVault[]
		loading: boolean
		hasErrors: boolean
		search: EarnSearch
		onSort: (sort: EarnSort) => void
	}
}

/** The vault by what it holds, never by who runs it. */
export function VaultLabel(props: VaultLabel.Props): React.JSX.Element {
	const { vault } = props
	return (
		<Link
			preload="intent"
			to="/address/$address"
			params={{ address: vault.address }}
			title={`${vault.asset.symbol} vault`}
			{...styles.link()}
		>
			<Inline gap="12" render={<span />}>
				<TokenLogo src={`/api/token/logo/${vault.asset.address}`} alt="" />
				<span {...styles.nowrap()}>
					<span {...styles.strong()}>{vault.asset.symbol} vault</span>
					<Table.Subtitle>
						<span {...styles.subtitle()}>
							{engineLabels[vault.engine]}
							{!vault.verified && (
								<>
									<span aria-hidden="true">·</span>
									<span {...styles.muted()}>Unverified</span>
								</>
							)}
							{vault.depositsPaused && (
								<>
									<span aria-hidden="true">·</span>
									<StatusIndicator intent="warning">
										Deposits paused
									</StatusIndicator>
								</>
							)}
						</span>
					</Table.Subtitle>
				</span>
			</Inline>
		</Link>
	)
}

function Dash(): React.JSX.Element {
	return <span {...styles.muted()}>—</span>
}

export function Stat(props: Stat.Props): React.JSX.Element {
	return (
		<Surface size="medium" {...styles.card()}>
			<Stack gap="8">
				<p {...styles.statLabel()}>{props.label}</p>
				<Skeleton show={props.value === undefined}>
					<p {...styles.statValue()}>
						{props.partial && props.value !== undefined ? '≥' : ''}
						{props.value ?? '$0.00M'}
					</p>
				</Skeleton>
			</Stack>
		</Surface>
	)
}

export declare namespace VaultLabel {
	type Props = {
		vault: EarnVault
	}
}

export declare namespace Stat {
	type Props = {
		label: string
		value: string | undefined
		partial?: boolean | undefined
	}
}
