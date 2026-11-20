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
import { useMemo, useState } from 'react'
import type * as React from 'react'
import { Address } from '#comps/Address'
import { PriceFormatter } from '#lib/formatting'
import { useRowLink } from '#lib/hooks'
import { vaultsQueryOptions } from '#lib/queries/vaults'
import {
	defaultVaultSearch,
	engineLabels,
	filterVaults,
	kindLabels,
	sortVaults,
	type Vault,
	type VaultSearch,
	vaultAssets,
	vaultSearchSchema,
	vaultTotals,
} from '#lib/vaults'

export const Route = createFileRoute('/_layout/vaults/')({
	component: VaultsPage,
	validateSearch: vaultSearchSchema,
	search: { middlewares: [stripSearchParams(defaultVaultSearch)] },
	head: () => ({ meta: [{ title: 'Vaults – Tempo Explorer' }] }),
	loader: async ({ context }) => {
		await Promise.race([
			context.queryClient.prefetchQuery(vaultsQueryOptions()),
			new Promise((resolve) => setTimeout(resolve, LOADER_WAIT)),
		])
	},
})

/** How long navigation waits for data before showing the page without it. */
const LOADER_WAIT = 300
const LOADING_ROWS = 5
/** Rows shown before Show all, the largest by TVL. */
const FIRST_ROWS = 25

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
/**
 * A lower bound, rounded down to three significant digits first, so the
 * compact form never shows more than the vaults that were read hold.
 */
const usdAtLeast = (value: number) => {
	if (value < 1000) return cents.format(Math.floor(value * 100) / 100)
	const step = 10 ** (Math.floor(Math.log10(value)) - 2)
	return usd(Math.floor(value / step) * step)
}
const date = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
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

/** The kind and engine under a vault's name, such as Tempo Earn · Veda. */
export function vaultSubtitle(vault: Vault): string {
	return vault.kind === 'earn' && vault.engine
		? `${kindLabels.earn} · ${engineLabels[vault.engine]}`
		: kindLabels[vault.kind]
}

function VaultsPage(): React.JSX.Element {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const query = useQuery(vaultsQueryOptions())
	const failed = query.isError && !query.data

	const ofKind = useMemo(
		() =>
			filterVaults(query.data?.vaults ?? [], {
				kind: search.kind,
				unverified: search.unverified,
			}),
		[query.data, search.kind, search.unverified],
	)
	const assets = useMemo(() => vaultAssets(ofKind), [ofKind])
	// An asset in the URL that no listed vault holds shows no vaults, never
	// every asset under that asset's name.
	const asset = search.asset.toLowerCase()
	const rows = useMemo(
		() =>
			sortVaults(filterVaults(ofKind, { asset, unverified: true }), search.dir),
		[ofKind, asset, search.dir],
	)
	const totals = useMemo(() => vaultTotals(rows), [rows])
	const pending = query.isPending
	const partial = query.data?.complete === false
	/** A lower bound: some vaults weren't read or have no USD value. */
	const atLeast = partial || totals.unpriced > 0
	const stale = query.isError && Boolean(query.data)

	function setSearch(next: Partial<VaultSearch>) {
		void navigate({
			search: (previous) => ({ ...previous, ...next }),
			replace: true,
			resetScroll: false,
		})
	}

	return (
		<div {...styles.page()}>
			<Container size="wide">
				<Stack gap="32">
					<div {...styles.header()}>
						<h1 {...styles.title()}>Vaults</h1>
						<p {...styles.intro()}>
							Tempo Earn and ERC-4626 vaults on Tempo, by asset, with the value
							each one holds.
						</p>
					</div>

					<Grid fit="medium" gap="16" render={<section aria-label="Totals" />}>
						<Stat
							label="Total value locked"
							value={
								pending || failed
									? undefined
									: atLeast
										? usdAtLeast(totals.tvl)
										: usd(totals.tvl)
							}
							partial={atLeast}
						/>
						<Stat
							label="Funded vaults"
							value={pending || failed ? undefined : String(totals.funded)}
							partial={atLeast}
						/>
						<Stat
							label="Assets"
							value={pending || failed ? undefined : String(totals.assets)}
						/>
					</Grid>

					<Stack gap="16">
						<div {...styles.bar()}>
							<Tabs.Root
								value={search.kind}
								onValueChange={(value) =>
									setSearch({
										kind: value as VaultSearch['kind'],
										asset: 'all',
									})
								}
								{...styles.assets()}
							>
								<Tabs.List variant="pill" size="small" aria-label="Vault kind">
									<Tabs.Tab value="all">All</Tabs.Tab>
									<Tabs.Tab value="earn">{kindLabels.earn}</Tabs.Tab>
									<Tabs.Tab value="erc4626">{kindLabels.erc4626}</Tabs.Tab>
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
						{assets.length > 1 && (
							<Tabs.Root
								value={asset}
								onValueChange={(value) => setSearch({ asset: String(value) })}
								{...styles.assets()}
							>
								<Tabs.List variant="pill" size="small" aria-label="Asset">
									<Tabs.Tab value="all">All assets</Tabs.Tab>
									{assets.map((token) => (
										<Tabs.Tab key={token.address} value={token.address}>
											{token.symbol}
										</Tabs.Tab>
									))}
								</Tabs.List>
							</Tabs.Root>
						)}

						<Surface size="medium" {...styles.card()}>
							<Stack gap="16">
								{failed && (
									<Alert intent="negative">
										<Alert.Icon />
										<Alert.Content>
											<Alert.Title>Vaults unavailable</Alert.Title>
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
								{stale && (
									<Alert intent="warning">
										<Alert.Icon />
										<Alert.Content>
											<Alert.Title>Couldn’t refresh vaults</Alert.Title>
											Showing data from{' '}
											{new Date(query.dataUpdatedAt).toLocaleTimeString(
												'en-US',
												{
													hour: 'numeric',
													minute: '2-digit',
												},
											)}
											.
											<Alert.Action
												disabled={query.isFetching}
												onClick={() => void query.refetch()}
											>
												{query.isFetching ? 'Retrying…' : 'Try again'}
											</Alert.Action>
										</Alert.Content>
									</Alert>
								)}
								{partial && (
									<Alert intent="warning">
										<Alert.Icon />
										<Alert.Content>
											<Alert.Title>Some vaults couldn’t be read</Alert.Title>
											Totals are a lower bound until they load.
											<Alert.Action
												disabled={query.isFetching}
												onClick={() => void query.refetch()}
											>
												{query.isFetching ? 'Retrying…' : 'Try again'}
											</Alert.Action>
										</Alert.Content>
									</Alert>
								)}
								<VaultsTable
									rows={rows}
									loading={rows.length === 0 && pending}
									hasErrors={failed || partial}
									dir={search.dir}
									onSort={() =>
										setSearch({ dir: search.dir === 'desc' ? 'asc' : 'desc' })
									}
								/>
							</Stack>
						</Surface>
						<p {...styles.muted()}>
							Totals cover verified vaults only and count money once: an Earn
							vault that deposits into a listed ERC-4626 vault isn’t added
							again. An ERC-4626 vault is verified when a verified Earn vault
							deposits into it; any other contract’s numbers are its own claim.
							Verified only also hides vaults worth under $1. Vaults whose asset
							has no USD price aren’t in the totals, which then show as a lower
							bound.
						</p>
					</Stack>
				</Stack>
			</Container>
		</div>
	)
}

export function VaultsTable(
	props: VaultsTable.Props,
): React.JSX.Element | null {
	const { rows, loading, hasErrors, dir, onSort } = props
	const rowLink = useRowLink()
	const [all, setAll] = useState(false)
	const shown = all ? rows : rows.slice(0, FIRST_ROWS)
	// When reads failed, an empty list isn't "no vaults": the alert above
	// says what happened and offers a retry.
	if (!loading && rows.length === 0)
		return hasErrors ? null : (
			<Empty.Root>
				<Empty.Title>No vaults</Empty.Title>
			</Empty.Root>
		)

	return (
		<div {...styles.scroll()}>
			<Table interactive aria-label="Vaults">
				<Table.Head>
					<Table.Row>
						<Table.HeaderCell>Vault</Table.HeaderCell>
						<Table.HeaderCell {...styles.wide()}>Address</Table.HeaderCell>
						<Table.HeaderCell {...styles.wide()}>Since</Table.HeaderCell>
						<Table.HeaderCell
							justify="end"
							title="Total assets in US dollars."
							aria-sort={dir === 'asc' ? 'ascending' : 'descending'}
						>
							<Table.SortButton onClick={onSort} aria-label="Sort by TVL">
								TVL
							</Table.SortButton>
						</Table.HeaderCell>
					</Table.Row>
				</Table.Head>
				<Table.Body>
					{shown.map((vault) => (
						<Table.Row
							key={vault.address}
							{...rowLink(`/vaults/${vault.address}`)}
						>
							<Table.Cell>
								<VaultLabel vault={vault} />
							</Table.Cell>
							<Table.Cell {...styles.wide()}>
								<Address address={vault.address} chars={4} />
							</Table.Cell>
							<Table.Cell {...styles.wide()}>
								{vault.deployment ? (
									<span {...styles.secondary()}>
										{date.format(vault.deployment.timestamp * 1000)}
									</span>
								) : (
									<Dash />
								)}
							</Table.Cell>
							<Table.Cell justify="end" numeric>
								{vault.tvl === null ? <Dash /> : usd(vault.tvl)}
							</Table.Cell>
						</Table.Row>
					))}
					{loading &&
						Array.from({ length: LOADING_ROWS }, (_, index) => (
							<Table.Row key={index} aria-busy="true">
								{Array.from({ length: 4 }, (_, cell) => (
									<Table.Cell
										key={cell}
										{...(cell === 1 || cell === 2 ? styles.wide() : {})}
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
			{rows.length > shown.length && (
				<button
					type="button"
					onClick={() => setAll(true)}
					className="mt-3 copy-13 text-accent hover:underline cursor-pointer"
				>
					Show all {rows.length} vaults
				</button>
			)}
		</div>
	)
}

/** The vault by what it holds, never by who runs it. */
export function VaultLabel(props: VaultLabel.Props): React.JSX.Element {
	const { vault } = props
	return (
		<Link
			preload="intent"
			to="/vaults/$vault"
			params={{ vault: vault.address }}
			title={`${vault.asset.symbol} vault`}
			{...styles.link()}
		>
			<Inline gap="12" render={<span />}>
				<TokenLogo src={`/api/token/logo/${vault.asset.address}`} alt="" />
				<span {...styles.nowrap()}>
					<span {...styles.strong()}>{vault.asset.symbol} vault</span>
					<Table.Subtitle>
						<span {...styles.subtitle()}>
							{vaultSubtitle(vault)}
							{!vault.verified && (
								<>
									<span aria-hidden="true">·</span>
									<span {...styles.muted()}>Unverified</span>
								</>
							)}
							{vault.usedBy.length > 0 && (
								<>
									<span aria-hidden="true">·</span>
									<span {...styles.muted()}>Earn venue</span>
								</>
							)}
							{vault.depositsPaused === true && (
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

export declare namespace VaultsTable {
	type Props = {
		rows: Vault[]
		loading: boolean
		hasErrors: boolean
		dir: 'asc' | 'desc'
		onSort: () => void
	}
}

export declare namespace VaultLabel {
	type Props = { vault: Vault }
}

export declare namespace Stat {
	type Props = {
		label: string
		value: string | undefined
		partial?: boolean | undefined
	}
}
