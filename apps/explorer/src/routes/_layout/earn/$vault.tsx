import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import type * as React from 'react'
import { formatUnits } from 'viem'
import * as z from 'zod/mini'
import { CopyButton } from '#comps/CopyButton'
import { DataGrid } from '#comps/DataGrid'
import { LivePill } from '#comps/DexSwaps'
import { RelativeTime } from '#comps/RelativeTime'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import {
	assetShare,
	type EarnActivity,
	type EarnVault,
	type EarnVaultActivity,
	engineLabels,
} from '#lib/earn'
import { PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import {
	earnVaultActivityQueryOptions,
	earnVaultsQueryOptions,
} from '#lib/queries/earn'
import { zAddress } from '#lib/zod'
import ChevronLeftIcon from '~icons/lucide/chevron-left'

const paramsSchema = z.object({ vault: zAddress({ lowercase: true }) })

export const Route = createFileRoute('/_layout/earn/$vault')({
	component: EarnVaultPage,
	params: {
		parse: (params) => ({
			vault: paramsSchema.parse(params).vault.toLowerCase() as `0x${string}`,
		}),
		stringify: (params) => params,
	},
	errorComponent: () => (
		<div className="max-w-[1200px] mx-auto px-4 pt-20 flex flex-col gap-3">
			<h1 className="heading-20 text-primary">Invalid vault link</h1>
			<p className="copy-14 text-secondary">Use a vault contract address.</p>
			<Link to="/earn" className="text-accent hover:underline">
				View all Earn vaults
			</Link>
		</div>
	),
	head: () => ({ meta: [{ title: 'Earn vault – Tempo Explorer' }] }),
	loader: async ({ context }) => {
		await Promise.race([
			context.queryClient.prefetchQuery(earnVaultsQueryOptions()),
			new Promise((resolve) => setTimeout(resolve, LOADER_WAIT)),
		])
	},
})

/** How long navigation waits for data before showing the page without it. */
const LOADER_WAIT = 300

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
const compact = new Intl.NumberFormat('en-US', {
	notation: 'compact',
	maximumFractionDigits: 2,
})
const small = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const share = new Intl.NumberFormat('en-US', {
	style: 'percent',
	maximumFractionDigits: 1,
})
const date = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
})
const count = new Intl.NumberFormat('en-US')

/** An amount in the asset's units, such as 1.2M. */
function amount(value: string | bigint, decimals: number): string {
	const units = Number(formatUnits(BigInt(value), decimals))
	return Math.abs(units) < 1000 ? small.format(units) : compact.format(units)
}

const headerButton =
	'inline-flex h-7! items-center gap-1.5 rounded-[7px]! border border-card-border px-2.5! copy-13 text-secondary hover:text-primary hover:bg-transparent! active:bg-transparent! [&>svg]:size-3.75! cursor-pointer press-down'
const card = 'rounded-body border border-card-border bg-card'

function EarnVaultPage(): React.JSX.Element {
	const { vault: address } = Route.useParams()
	const query = useQuery(earnVaultsQueryOptions())
	const vault = query.data?.vaults.find((item) => item.address === address)
	const missing = Boolean(query.data) && !vault
	const isMobile = useMediaQuery('(max-width: 799px)')
	const [section, setSection] = useState(0)
	const [live, setLive] = useState(true)
	const [paused, setPaused] = useState(false)
	const activity = useQuery({
		...earnVaultActivityQueryOptions(
			address,
			vault?.asset.address ?? address,
			live && !paused,
		),
		enabled: Boolean(vault),
	})

	return (
		<div className="flex flex-col gap-6 px-4 pt-8 sm:pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex flex-col gap-3 min-w-0">
					<Link
						to="/earn"
						className="inline-flex items-center gap-1 self-start copy-13 text-tertiary hover:text-primary"
					>
						<ChevronLeftIcon className="size-3.5" />
						Earn
					</Link>
					<h1 className="flex flex-wrap items-center gap-3 text-[24px] sm:text-[32px] leading-tight tracking-[-0.02em] font-semibold text-primary">
						{vault ? (
							<span className="inline-flex items-center gap-3 whitespace-nowrap">
								<TokenIcon
									address={vault.asset.address}
									className="size-6 sm:size-7 shrink-0"
								/>
								{vault.asset.symbol} vault
							</span>
						) : (
							'Earn vault'
						)}
					</h1>
					{vault && <VaultBadges vault={vault} />}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<CopyButton
						value={() => window.location.href}
						ariaLabel="Copy vault link"
						className={headerButton}
					>
						Copy link
					</CopyButton>
					<Link
						to="/address/$address"
						params={{ address }}
						className={headerButton}
					>
						View contract
					</Link>
				</div>
			</div>

			{query.isError && !query.data ? (
				<section
					role="alert"
					className={cx(
						card,
						'p-[18px] copy-14 text-secondary flex flex-col items-start gap-3',
					)}
				>
					<p>{query.error.message}</p>
					<button
						type="button"
						className="inline-flex items-center rounded-[7px] border border-card-border px-3 py-2 copy-13 text-secondary hover:text-primary cursor-pointer press-down"
						onClick={() => void query.refetch()}
					>
						Try again
					</button>
				</section>
			) : missing ? (
				<section
					className={cx(
						card,
						'p-[18px] copy-14 text-secondary flex flex-col items-start gap-2',
					)}
				>
					<p className="text-primary">This address isn’t a Tempo Earn vault.</p>
					<p className="font-mono copy-13 break-all">{address}</p>
					<Link to="/earn" className="text-accent hover:underline">
						View all Earn vaults
					</Link>
				</section>
			) : (
				<>
					<VaultStats
						vault={vault}
						vaults={query.data?.vaults ?? []}
						activity={activity.data}
					/>
					{vault && (
						<Sections
							mode={isMobile ? 'stacked' : 'tabs'}
							activeSection={section}
							onSectionChange={setSection}
							sections={[
								{
									title: 'Activity',
									autoCollapse: false,
									contextual: (
										<LivePill
											live={live && !paused}
											onToggle={() => setLive(!live)}
										/>
									),
									content:
										activity.isError && !activity.data ? (
											<p
												role="alert"
												className="p-[18px] copy-14 text-secondary"
											>
												{activity.error.message}
											</p>
										) : (
											// biome-ignore lint/a11y/noStaticElementInteractions: pause on hover
											<div
												onMouseEnter={() => setPaused(true)}
												onMouseLeave={() => setPaused(false)}
											>
												<ActivityGrid
													items={activity.data?.activity ?? []}
													loading={activity.isPending}
													live={live && !paused}
													vault={vault}
												/>
											</div>
										),
								},
								{
									title: 'Details',
									autoCollapse: false,
									content: (
										<VaultDetails vault={vault} activity={activity.data} />
									),
								},
							]}
						/>
					)}
				</>
			)}
		</div>
	)
}

/** Engine, registry and deposit status, never who runs the vault. */
export function VaultBadges(props: VaultBadges.Props): React.JSX.Element {
	const { vault } = props
	const badge =
		'inline-flex items-center rounded-[4px] px-[6px] py-[2px] label-12 font-medium'
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className={cx(badge, 'bg-base-alt text-secondary')}>
				{engineLabels[vault.engine]}
			</span>
			<span
				className={cx(
					badge,
					vault.verified
						? 'bg-positive/10 text-positive'
						: 'bg-base-alt text-tertiary',
				)}
			>
				{vault.verified ? 'Verified' : 'Unverified'}
			</span>
			{vault.depositsPaused && (
				<span className={cx(badge, 'bg-warning/10 text-warning')}>
					Deposits paused
				</span>
			)}
		</div>
	)
}

export function VaultStats(props: VaultStats.Props): React.JSX.Element {
	const { vault, vaults, activity } = props
	const decimals = vault?.asset.decimals ?? 6
	const symbol = vault?.asset.symbol ?? ''
	const portion = vault ? assetShare(vault, vaults) : null
	const net = activity
		? BigInt(activity.flows.deposited) - BigInt(activity.flows.withdrawn)
		: undefined
	const used =
		activity?.cap && vault?.totalAssets
			? Number((BigInt(vault.totalAssets) * 10_000n) / BigInt(activity.cap)) /
				10_000
			: null
	return (
		<section
			aria-label="Vault totals"
			className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
		>
			<StatCard
				label="Total value locked"
				value={vault ? (vault.tvl === null ? '—' : usd(vault.tvl)) : undefined}
				detail={
					vault?.totalAssets
						? `${amount(vault.totalAssets, decimals)} ${symbol}`
						: undefined
				}
			/>
			<StatCard
				label={`Share of Earn ${symbol}`.trim()}
				value={
					vault ? (portion === null ? '—' : share.format(portion)) : undefined
				}
				detail={vault ? `of ${symbol} held in Earn vaults` : undefined}
			/>
			<StatCard
				label="Net flow (30d)"
				value={
					net === undefined
						? undefined
						: `${net > 0n ? '+' : net < 0n ? '−' : ''}${amount(net < 0n ? -net : net, decimals)} ${symbol}`
				}
				detail={
					activity
						? `${count.format(activity.flows.deposits)} deposits · ${count.format(activity.flows.withdrawals)} withdrawals`
						: undefined
				}
			/>
			<StatCard
				label="Deposit cap"
				value={
					activity
						? activity.cap
							? `${amount(activity.cap, decimals)} ${symbol}`
							: 'No cap'
						: undefined
				}
				detail={used === null ? undefined : `${share.format(used)} used`}
			/>
		</section>
	)
}

export function StatCard(props: StatCard.Props): React.JSX.Element {
	return (
		<div className={cx(card, 'flex flex-col gap-2 p-[18px]')}>
			<p className="copy-13 text-tertiary">{props.label}</p>
			<p
				className={cx(
					'text-[24px] leading-none tracking-[-0.02em] font-medium tabular-nums text-primary',
					props.value === undefined && 'text-tertiary',
				)}
			>
				{props.value ?? '…'}
			</p>
			<p className="copy-13 text-secondary min-h-[1lh]">{props.detail ?? ''}</p>
		</div>
	)
}

export function ActivityGrid(props: ActivityGrid.Props): React.JSX.Element {
	const { items, loading, live, vault } = props
	const label = (item: EarnActivity) => (
		<span
			className={cx(
				'whitespace-nowrap',
				item.kind === 'deposit' ? 'text-positive' : 'text-secondary',
			)}
		>
			{item.kind === 'deposit' ? 'Deposit' : 'Withdrawal'}
		</span>
	)
	const value = (item: EarnActivity) => (
		<span className="tabular-nums text-primary whitespace-nowrap">
			{amount(item.assets, vault.asset.decimals)} {vault.asset.symbol}
		</span>
	)
	return (
		<DataGrid
			liveScope={live ? 'earn-vault-activity' : undefined}
			columns={{
				stacked: [
					{ label: 'Type', align: 'start', width: '1fr' },
					{ label: 'Amount', align: 'end', width: 'max-content' },
				],
				tabs: [
					{ label: 'Time', align: 'start', width: 140 },
					{ label: 'Type', align: 'start', width: '1fr', minWidth: 140 },
					{ label: 'Amount', align: 'end', width: '1fr', minWidth: 140 },
					{ label: 'Block', align: 'end', width: '1fr', minWidth: 120 },
				],
			}}
			items={(mode) =>
				items.map((item) => ({
					key: item.id,
					cells:
						mode === 'stacked'
							? [
									<div key="type" className="flex flex-col gap-1 min-w-0">
										{label(item)}
										<RelativeTime
											timestamp={BigInt(item.timestamp)}
											className="label-12 text-tertiary"
										/>
									</div>,
									<span key="amount">{value(item)}</span>,
								]
							: [
									<RelativeTime
										key="time"
										timestamp={BigInt(item.timestamp)}
										className="text-secondary tabular-nums whitespace-nowrap"
									/>,
									<span key="type">{label(item)}</span>,
									<span key="amount">{value(item)}</span>,
									<span key="block" className="tabular-nums text-tertiary">
										{count.format(item.block)}
									</span>,
								],
					link: {
						href: `/tx/${item.transactionHash}`,
						title: 'View transaction',
					},
				}))
			}
			totalItems={items.length}
			page={1}
			loading={loading}
			itemsPerPage={Math.max(items.length, 8)}
			itemsLabel="events"
			pagination="simple"
			showSimpleCount={false}
			emptyState="No deposits or withdrawals yet"
		/>
	)
}

export function VaultDetails(props: VaultDetails.Props): React.JSX.Element {
	const { vault, activity } = props
	const { decimals, symbol } = vault.asset
	const rows: { label: string; value: React.ReactNode }[] = [
		{ label: 'Vault', value: <AddressLink address={vault.address} /> },
		{
			label: 'Asset',
			value: (
				<Link
					to="/token/$address"
					params={{ address: vault.asset.address }}
					className="inline-flex items-center gap-2 text-accent hover:underline"
				>
					<TokenIcon address={vault.asset.address} />
					{symbol}
				</Link>
			),
		},
		{ label: 'Engine', value: engineLabels[vault.engine] },
	]
	if (vault.engineAddress)
		rows.push({
			label: 'Engine contract',
			value: <AddressLink address={vault.engineAddress} />,
		})
	if (vault.venue)
		rows.push({ label: 'Venue', value: <AddressLink address={vault.venue} /> })
	if (vault.deployment)
		rows.push(
			{
				label: 'Deployed',
				value: (
					<span className="inline-flex flex-wrap items-center gap-x-2">
						{date.format(vault.deployment.timestamp * 1000)}
						<Link
							to="/block/$id"
							params={{ id: String(vault.deployment.block) }}
							className="text-accent hover:underline tabular-nums"
						>
							Block {count.format(vault.deployment.block)}
						</Link>
					</span>
				),
			},
			{
				label: 'Factory',
				value: <AddressLink address={vault.deployment.factory} />,
			},
		)
	rows.push(
		{ label: 'Deposits', value: vault.depositsPaused ? 'Paused' : 'Open' },
		{
			label: 'Pending redemptions',
			value: count.format(vault.openRedeemRequests),
		},
	)
	if (activity)
		rows.push(
			{
				label: 'Deposited (30d)',
				value: `${amount(activity.flows.deposited, decimals)} ${symbol}`,
			},
			{
				label: 'Withdrawn (30d)',
				value: `${amount(activity.flows.withdrawn, decimals)} ${symbol}`,
			},
		)
	return (
		<dl className="flex flex-col">
			{rows.map((row) => (
				<div
					key={row.label}
					className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-[18px] py-3.5 border-b last:border-b-0 border-dashed border-card-border"
				>
					<dt className="copy-14 text-tertiary">{row.label}</dt>
					<dd className="min-w-0 copy-14 text-primary">{row.value}</dd>
				</div>
			))}
		</dl>
	)
}

export function AddressLink(props: AddressLink.Props): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.address }}
			className="font-mono copy-13 text-accent hover:underline break-all"
		>
			{props.address}
		</Link>
	)
}

export declare namespace VaultBadges {
	type Props = { vault: EarnVault }
}

export declare namespace VaultStats {
	type Props = {
		vault: EarnVault | undefined
		vaults: readonly EarnVault[]
		activity: EarnVaultActivity | undefined
	}
}

export declare namespace StatCard {
	type Props = {
		label: string
		value: string | undefined
		detail?: string | undefined
	}
}

export declare namespace ActivityGrid {
	type Props = {
		items: EarnActivity[]
		loading: boolean
		live: boolean
		vault: EarnVault
	}
}

export declare namespace VaultDetails {
	type Props = {
		vault: EarnVault
		activity: EarnVaultActivity | undefined
	}
}

export declare namespace AddressLink {
	type Props = { address: `0x${string}` }
}
