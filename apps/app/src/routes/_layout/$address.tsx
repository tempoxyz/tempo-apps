import { Link, createFileRoute } from '@tanstack/react-router'
import { waapi, spring } from 'animejs'
import type { Address } from 'ox'
import * as React from 'react'
import { encode } from 'uqr'
import { formatUnits } from 'viem'
import { getTransactionReceipt } from 'wagmi/actions'
import {
	TxDescription,
	parseKnownEvents,
	preferredEventsFilter,
	getPerspectiveEvent,
	type KnownEvent,
	type GetTokenMetadataFn,
} from '#comps/activity'
import { Layout } from '#comps/Layout'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import { getWagmiConfig } from '#wagmi.config'
import CopyIcon from '~icons/lucide/copy'
import ExternalLinkIcon from '~icons/lucide/external-link'
import ArrowLeftIcon from '~icons/lucide/arrow-left'
import CheckIcon from '~icons/lucide/check'

const BALANCES_API_URL = import.meta.env.VITE_BALANCES_API_URL

type TokenMetadata = {
	address: string
	name: string
	symbol: string
	decimals: number
	currency: string
	priceUsd: number
}

type BalanceEntry = {
	token: string
	balance: string
	valueUsd: number
}

type AssetData = {
	address: Address.Address
	metadata:
		| { name?: string; symbol?: string; decimals?: number; priceUsd?: number }
		| undefined
	balance: string | undefined
	valueUsd: number | undefined
}

async function fetchAssets(
	accountAddress: Address.Address,
): Promise<AssetData[]> {
	if (!BALANCES_API_URL) return []

	const [tokensRes, balancesRes] = await Promise.all([
		fetch(`${BALANCES_API_URL}tokens`).catch(() => null),
		fetch(`${BALANCES_API_URL}balances/${accountAddress}`).catch(() => null),
	])

	if (!tokensRes?.ok || !balancesRes?.ok) return []

	const tokens = (await tokensRes.json()) as TokenMetadata[]
	const balances = (await balancesRes.json()) as BalanceEntry[]

	const balanceMap = new Map(
		balances.map((b) => [
			b.token.toLowerCase(),
			{ balance: b.balance, valueUsd: b.valueUsd },
		]),
	)

	return tokens.map((token) => {
		const balanceData = balanceMap.get(token.address.toLowerCase())
		return {
			address: token.address as Address.Address,
			metadata: {
				name: token.name,
				symbol: token.symbol,
				decimals: token.decimals,
				priceUsd: token.priceUsd,
			},
			balance: balanceData?.balance ?? '0',
			valueUsd: balanceData?.valueUsd ?? 0,
		}
	})
}

type ApiTransaction = {
	hash: string
	from: string
	to: string | null
	value: string
	blockNumber: string
}

type TransactionsResponse = {
	transactions: ApiTransaction[]
	hasMore: boolean
	error: string | null
}

type ActivityItem = {
	hash: string
	events: KnownEvent[]
}

async function fetchTransactions(
	address: Address.Address,
	tokenMetadataMap: Map<Address.Address, { decimals: number; symbol: string }>,
): Promise<ActivityItem[]> {
	const config = getWagmiConfig()

	try {
		const response = await fetch(
			`https://explore.tempo.xyz/api/address/${address}?limit=10`,
		)
		if (!response.ok) return []
		const data = (await response.json()) as TransactionsResponse
		const txHashes = data.transactions?.map((tx) => tx.hash) ?? []

		const getTokenMetadata: GetTokenMetadataFn = (tokenAddress) => {
			return tokenMetadataMap.get(tokenAddress)
		}

		const items: ActivityItem[] = []
		for (const hash of txHashes) {
			try {
				const receipt = await getTransactionReceipt(config, {
					hash: hash as `0x${string}`,
				})
				const events = parseKnownEvents(receipt, {
					getTokenMetadata,
					viewer: address,
				})
				items.push({ hash, events })
			} catch {
				// Skip failed receipts
			}
		}

		return items
	} catch {
		return []
	}
}

export const Route = createFileRoute('/_layout/$address')({
	component: AddressView,
	loader: async ({ params }) => {
		const assets = await fetchAssets(params.address as Address.Address)

		const tokenMetadataMap = new Map<
			Address.Address,
			{ decimals: number; symbol: string }
		>()
		for (const asset of assets) {
			if (asset.metadata?.decimals !== undefined && asset.metadata?.symbol) {
				tokenMetadataMap.set(asset.address, {
					decimals: asset.metadata.decimals,
					symbol: asset.metadata.symbol,
				})
			}
		}

		const activity = await fetchTransactions(
			params.address as Address.Address,
			tokenMetadataMap,
		)
		return { assets, activity }
	},
})

function AddressView() {
	const { address } = Route.useParams()
	const { assets: assetsData, activity } = Route.useLoaderData()
	const { copy, notifying } = useCopy()

	return (
		<>
			<Layout.Header
				left={
					<Link
						to="/"
						className="flex items-center gap-1 text-secondary hover:text-primary"
					>
						<ArrowLeftIcon className="size-2" />
						<span className="text-sm">Back</span>
					</Link>
				}
				right={null}
			/>

			<div className="py-3">
				<div className="flex items-start justify-between gap-2 mb-4">
					<div>
						<h1 className="text-2xl font-semibold text-primary mb-1">
							Tempo Account
						</h1>
						<div className="flex items-center gap-1">
							<code className="text-sm font-mono text-secondary break-all">
								{address}
							</code>
							<button
								type="button"
								onClick={() => copy(address)}
								className="p-0.75 rounded-md hover:bg-base-alt cursor-pointer press-down"
								title="Copy address"
							>
								{notifying ? (
									<CheckIcon className="size-2 text-positive" />
								) : (
									<CopyIcon className="size-2 text-secondary" />
								)}
							</button>
							<a
								href={`https://explore.tempo.xyz/address/${address}`}
								target="_blank"
								rel="noopener noreferrer"
								className="p-0.75 rounded-md hover:bg-base-alt press-down"
								title="View on Explorer"
							>
								<ExternalLinkIcon className="size-2 text-secondary" />
							</a>
						</div>
					</div>
					<div className="flex-shrink-0">
						<QRCode value={address} />
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<Section title="Assets" defaultOpen>
						<HoldingsTable assets={assetsData} />
					</Section>

					<Section title="Activity">
						<ActivityList activity={activity} address={address} />
					</Section>

					<Section title="Receive">
						<ReceiveContent address={address} />
					</Section>

					<Section title="Fee Token">
						<ConfigureContent assets={assetsData} />
					</Section>
				</div>
			</div>
		</>
	)
}

const springFast = spring({
	mass: 1,
	stiffness: 2600,
	damping: 100,
})

const springSlower = spring({
	mass: 1,
	stiffness: 1200,
	damping: 80,
})

function Section(props: {
	title: string
	defaultOpen?: boolean
	children: React.ReactNode
}) {
	const { title, defaultOpen = false, children } = props
	const [open, setOpen] = React.useState(defaultOpen)
	const contentRef = React.useRef<HTMLDivElement>(null)
	const wrapperRef = React.useRef<HTMLDivElement>(null)
	const innerRef = React.useRef<HTMLDivElement>(null)
	const animationRef = React.useRef<ReturnType<typeof waapi.animate> | null>(
		null,
	)

	const handleClick = () => {
		const content = contentRef.current
		const wrapper = wrapperRef.current
		const inner = innerRef.current
		if (!content || !wrapper || !inner) return

		// Cancel any running animation
		if (animationRef.current) {
			animationRef.current.cancel()
			animationRef.current = null
		}

		const nextOpen = !open
		setOpen(nextOpen)

		if (nextOpen) {
			const targetHeight = wrapper.getBoundingClientRect().height
			content.style.height = '0px'
			animationRef.current = waapi.animate(content, {
				height: [0, targetHeight],
				ease: springFast,
			})
			waapi.animate(inner, {
				translateY: ['-40%', '0%'],
				opacity: [0, 1],
				ease: springSlower,
			})
			animationRef.current.then(() => {
				requestAnimationFrame(() => {
					content.style.height = 'auto'
				})
				animationRef.current = null
			})
		} else {
			const currentHeight = content.offsetHeight
			content.style.height = `${currentHeight}px`
			animationRef.current = waapi.animate(content, {
				height: [currentHeight, 0],
				ease: springFast,
			})
			waapi.animate(inner, {
				scale: [1, 1],
				opacity: [1, 0],
				ease: springFast,
			})
			animationRef.current.then(() => {
				animationRef.current = null
			})
		}
	}

	return (
		<div className="rounded-lg border border-card-border bg-card-header">
			<button
				type="button"
				onClick={handleClick}
				className={cx(
					'flex w-full items-center justify-between h-[40px] px-2 cursor-pointer select-none press-down',
					'text-[13px] font-medium text-primary',
					'rounded-lg! focus-visible:outline-2! focus-visible:outline-accent! focus-visible:outline-offset-0!',
				)}
			>
				{title}
				<span
					className={cx(
						'text-[16px] font-mono',
						open ? 'text-tertiary' : 'text-accent',
					)}
				>
					[{open ? '–' : <span className="relative top-px">+</span>}]
				</span>
			</button>
			<div
				ref={contentRef}
				className="overflow-hidden rounded-b-lg"
				style={{ height: open ? 'auto' : 0 }}
				inert={!open ? true : undefined}
			>
				<div
					ref={wrapperRef}
					className="bg-card border-t border-card-border px-2 py-2 rounded-b-lg overflow-hidden"
				>
					<div ref={innerRef} className="origin-top">
						{children}
					</div>
				</div>
			</div>
		</div>
	)
}

function QRCode({ value, size = 100 }: { value: string; size?: number }) {
	const { data } = encode(value)
	const gridSize = data.length
	const cellSize = 100 / gridSize

	const cells: Array<{ x: number; y: number }> = []
	for (let y = 0; y < data.length; y++) {
		for (let x = 0; x < data[y].length; x++) {
			if (data[y][x]) cells.push({ x, y })
		}
	}

	return (
		<svg
			aria-label="QR Code"
			className="rounded-lg border border-base-border bg-white p-1.5"
			width={size}
			height={size}
			viewBox="0 0 100 100"
			role="img"
		>
			{cells.map(({ x, y }) => (
				<rect
					key={`${x}-${y}`}
					x={x * cellSize}
					y={y * cellSize}
					width={cellSize}
					height={cellSize}
					fill="black"
				/>
			))}
		</svg>
	)
}

function ReceiveContent({ address }: { address: string }) {
	const { copy, notifying } = useCopy()

	return (
		<div className="flex flex-col items-center gap-2 py-2">
			<QRCode value={address} size={140} />
			<button
				type="button"
				onClick={() => copy(address)}
				className="flex items-center gap-1 text-[13px] text-secondary hover:text-primary cursor-pointer press-down mt-1"
			>
				<code className="font-mono text-[12px]">
					{address.slice(0, 8)}…{address.slice(-6)}
				</code>
				{notifying ? (
					<CheckIcon className="size-1.5 text-positive" />
				) : (
					<CopyIcon className="size-1.5 text-tertiary" />
				)}
			</button>
		</div>
	)
}

function ConfigureContent({ assets }: { assets: AssetData[] }) {
	const [currentToken, setCurrentToken] = React.useState<Address.Address>(
		assets[0]?.address ?? ('' as Address.Address),
	)

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-col gap-1">
				<p className="text-[12px] text-tertiary">
					Select which token to use for paying transaction fees.
				</p>
			</div>
			<div className="flex flex-col gap-1">
				{assets.map((asset) => {
					const isCurrent = currentToken === asset.address
					return (
						<div key={asset.address} className="flex items-center gap-2 py-1">
							<TokenIcon address={asset.address} />
							<span className="flex-1 text-[13px] text-primary">
								{asset.metadata?.name ?? (
									<span className="text-tertiary">…</span>
								)}
							</span>
							{isCurrent ? (
								<span className="text-[11px] font-normal bg-base-alt text-tertiary rounded-md px-[6px] py-[2px]">
									Current
								</span>
							) : (
								<button
									type="button"
									onClick={() => setCurrentToken(asset.address)}
									className="text-[11px] font-medium bg-accent text-white rounded-md px-[8px] py-[3px] cursor-pointer press-down hover:bg-accent/90"
								>
									Set
								</button>
							)}
						</div>
					)
				})}
			</div>
		</div>
	)
}

function formatAmount(value: string, decimals: number): string {
	const formatted = formatUnits(BigInt(value), decimals)
	const num = Number(formatted)
	if (num === 0) return '0'
	if (num < 0.01) return '<0.01'
	return num.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
}

function formatUsd(value: number): string {
	if (value === 0) return '$0.00'
	return `$${value.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

function HoldingsTable({ assets }: { assets: AssetData[] }) {
	const [hideZero, setHideZero] = React.useState(true)

	if (assets.length === 0) {
		return (
			<div className="text-sm text-secondary">
				<p>No assets found.</p>
			</div>
		)
	}

	const filteredAssets = (
		hideZero
			? assets.filter((a) => a.balance !== '0' && a.balance !== undefined)
			: assets
	).toSorted((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))

	const zeroCount = assets.filter(
		(a) => a.balance === '0' || a.balance === undefined,
	).length

	const ROW_HEIGHT = 48

	return (
		<div className="text-[13px] -mx-2 grid grid-cols-[2fr_1fr_auto] md:grid-cols-[2fr_1fr_1fr_auto]">
			<div
				className="grid grid-cols-subgrid col-span-3 md:col-span-4 border-b border-dashed border-card-border"
				style={{ height: ROW_HEIGHT }}
			>
				<span className="px-2 flex items-center text-tertiary">Asset</span>
				<span className="px-2 flex items-center justify-end text-tertiary">
					Amount
				</span>
				<span className="px-2 hidden md:flex items-center justify-end text-tertiary">
					Value
				</span>
				<span className="px-2 flex items-center justify-end">
					{zeroCount > 0 && (
						<button
							type="button"
							onClick={() => setHideZero(!hideZero)}
							className={cx(
								'text-[11px] px-1.5 py-0.5 rounded cursor-pointer',
								hideZero
									? 'bg-accent/10 text-accent'
									: 'bg-base-alt text-tertiary hover:text-secondary',
							)}
						>
							{hideZero ? 'Show zero' : 'Hide zero'}
						</button>
					)}
				</span>
			</div>
			<div
				className="grid grid-cols-subgrid col-span-3 md:col-span-4 overflow-y-auto focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px] rounded"
				style={{ maxHeight: 'calc(100vh - 80px)' }}
				tabIndex={0}
			>
				{filteredAssets.map((asset, index) => (
					<div
						key={asset.address}
						className={cx(
							'grid grid-cols-subgrid col-span-3 md:col-span-4',
							index < filteredAssets.length - 1 &&
								'border-b border-dashed border-card-border',
						)}
						style={{ height: ROW_HEIGHT }}
					>
						<span className="px-2 text-primary flex items-center gap-1.5">
							<TokenIcon address={asset.address} />
							{asset.metadata?.name ?? (
								<span className="text-tertiary">…</span>
							)}
						</span>
						<span
							className="px-2 flex flex-col items-end justify-center overflow-hidden md:flex-row md:items-center"
							title={
								asset.balance !== undefined &&
								asset.metadata?.decimals !== undefined
									? formatAmount(asset.balance, asset.metadata.decimals)
									: undefined
							}
						>
							<span className="truncate text-primary font-mono">
								{asset.balance !== undefined &&
								asset.metadata?.decimals !== undefined ? (
									formatAmount(asset.balance, asset.metadata.decimals)
								) : (
									<span className="text-tertiary">…</span>
								)}
							</span>
							<span className="truncate text-secondary text-[11px] md:hidden">
								{asset.valueUsd !== undefined ? (
									formatUsd(asset.valueUsd)
								) : (
									<span className="text-tertiary">…</span>
								)}
							</span>
						</span>
						<span
							className="px-2 text-secondary hidden md:flex items-center justify-end overflow-hidden"
							title={
								asset.valueUsd !== undefined
									? formatUsd(asset.valueUsd)
									: undefined
							}
						>
							<span className="truncate">
								{asset.valueUsd !== undefined ? (
									formatUsd(asset.valueUsd)
								) : (
									<span className="text-tertiary">…</span>
								)}
							</span>
						</span>
						<span className="px-2 flex items-center justify-end">
							<button
								type="button"
								className="text-[11px] font-medium text-accent rounded-md px-[8px] py-[3px] cursor-pointer press-down hover:bg-accent/10"
							>
								Send
							</button>
						</span>
					</div>
				))}
			</div>
		</div>
	)
}

function ActivityList({
	activity,
	address,
}: {
	activity: ActivityItem[]
	address: string
}) {
	const viewer = address as Address.Address

	if (activity.length === 0) {
		return (
			<div className="text-sm text-secondary">
				<p>No activity yet.</p>
			</div>
		)
	}

	const transformEvent = (event: KnownEvent) =>
		getPerspectiveEvent(event, viewer)

	return (
		<div className="text-[13px] -mx-2">
			{activity.map((item, index) => (
				<a
					key={item.hash}
					href={`https://explore.tempo.xyz/tx/${item.hash}`}
					target="_blank"
					rel="noopener noreferrer"
					className={cx(
						'flex items-center gap-2 px-2 py-1.5 hover:bg-base-alt transition-colors',
						index < activity.length - 1 &&
							'border-b border-dashed border-card-border',
					)}
				>
					<TxDescription.ExpandGroup
						events={item.events}
						seenAs={viewer}
						transformEvent={transformEvent}
						limitFilter={preferredEventsFilter}
						emptyContent="Transaction"
					/>
					<ExternalLinkIcon className="size-1.5 text-tertiary shrink-0" />
				</a>
			))}
			<a
				href={`https://explore.tempo.xyz/address/${address}`}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center justify-center gap-1 px-2 py-1.5 text-accent hover:text-accent/80 transition-colors"
			>
				<span>View all on Explorer</span>
				<ExternalLinkIcon className="size-1.5" />
			</a>
		</div>
	)
}
