import { Link, createFileRoute } from '@tanstack/react-router'
import { waapi, spring } from 'animejs'
import { Address, Hex } from 'ox'
import * as React from 'react'
import { encode } from 'uqr'
import { formatUnits } from 'viem'
import { Abis } from 'viem/tempo'
import { readContract } from 'wagmi/actions'
import { Layout } from '#comps/Layout'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import { getWagmiConfig } from '#wagmi.config'
import CopyIcon from '~icons/lucide/copy'
import ExternalLinkIcon from '~icons/lucide/external-link'
import ArrowLeftIcon from '~icons/lucide/arrow-left'
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right'
import ArrowDownLeftIcon from '~icons/lucide/arrow-down-left'
import CheckIcon from '~icons/lucide/check'

const TOKENS = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c0000000000000000000000000000000000001',
	'0x20c0000000000000000000000000000000000002',
	'0x20c0000000000000000000000000000000000003',
] as const

type AssetData = {
	address: Address.Address
	metadata: { name?: string; symbol?: string; decimals?: number } | undefined
	balance: string | undefined
}

async function fetchAssets(
	accountAddress: Address.Address,
): Promise<AssetData[]> {
	const config = getWagmiConfig()

	const results = await Promise.all(
		TOKENS.map(async (token) => {
			const [name, symbol, decimals, balance] = await Promise.all([
				readContract(config, {
					address: token,
					abi: Abis.tip20,
					functionName: 'name',
				}).catch(() => undefined),
				readContract(config, {
					address: token,
					abi: Abis.tip20,
					functionName: 'symbol',
				}).catch(() => undefined),
				readContract(config, {
					address: token,
					abi: Abis.tip20,
					functionName: 'decimals',
				}).catch(() => undefined),
				readContract(config, {
					address: token,
					abi: Abis.tip20,
					functionName: 'balanceOf',
					args: [accountAddress],
				}).catch(() => undefined),
			])

			return {
				address: token as Address.Address,
				metadata:
					name && symbol && decimals !== undefined
						? { name, symbol, decimals }
						: undefined,
				balance: balance !== undefined ? balance.toString() : undefined,
			}
		}),
	)

	return results
}

type Transaction = {
	hash: string
	from: string
	to: string | null
	value: string
	blockNumber: string
}

type TransactionsResponse = {
	transactions: Transaction[]
	hasMore: boolean
	error: string | null
}

async function fetchTransactions(
	address: Address.Address,
): Promise<Transaction[]> {
	try {
		const response = await fetch(
			`https://explore.tempo.xyz/api/address/${address}?limit=10`,
		)
		if (!response.ok) return []
		const data = (await response.json()) as TransactionsResponse
		return data.transactions ?? []
	} catch {
		return []
	}
}

export const Route = createFileRoute('/_layout/$address')({
	component: AddressView,
	loader: async ({ params }) => {
		const [assets, transactions] = await Promise.all([
			fetchAssets(params.address as Address.Address),
			fetchTransactions(params.address as Address.Address),
		])
		return { assets, transactions }
	},
})

function AddressView() {
	const { address } = Route.useParams()
	const { assets: assetsData, transactions } = Route.useLoaderData()
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
						<ActivityList transactions={transactions} address={address} />
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
	stiffness: 2400,
	damping: 100,
})

const springSlower = spring({
	mass: 1,
	stiffness: 1200,
	damping: 70,
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
				translateY: ['-60%', '0%'],
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
					[{open ? '–' : '+'}]
				</span>
			</button>
			<div
				ref={contentRef}
				className="overflow-hidden"
				style={{ height: open ? 'auto' : 0 }}
			>
				<div
					ref={wrapperRef}
					className="bg-card border-t border-card-border px-2 py-2"
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
		TOKENS[0],
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

function formatValue(value: string, decimals: number): string {
	const PRICE_PER_TOKEN = 1
	const num = Number(formatUnits(BigInt(value), decimals)) * PRICE_PER_TOKEN
	if (num === 0) return '$0.00'
	return `$${num.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

function HoldingsTable({ assets }: { assets: AssetData[] }) {
	return (
		<div className="text-[13px] -mx-2">
			<div className="grid grid-cols-[1fr_auto_auto_auto] border-b border-dashed border-card-border">
				<span className="px-2 py-1.5 text-tertiary">Asset</span>
				<span className="px-2 py-1.5 text-tertiary text-right">Amount</span>
				<span className="px-2 py-1.5 text-tertiary text-right">Value</span>
				<span className="px-2 py-1.5" />
			</div>
			{assets.map((asset, index) => (
				<div
					key={asset.address}
					className={cx(
						'grid grid-cols-[1fr_auto_auto_auto] min-h-[48px]',
						index < assets.length - 1 &&
							'border-b border-dashed border-card-border',
					)}
				>
					<span className="px-2 py-1.5 text-primary flex items-center gap-1.5">
						<TokenIcon address={asset.address} />
						{asset.metadata?.name ?? <span className="text-tertiary">…</span>}
					</span>
					<span className="px-2 py-1.5 text-primary text-right font-mono flex items-center justify-end">
						{asset.balance !== undefined &&
						asset.metadata?.decimals !== undefined ? (
							formatAmount(asset.balance, asset.metadata.decimals)
						) : (
							<span className="text-tertiary">…</span>
						)}
					</span>
					<span className="px-2 py-1.5 text-secondary text-right flex items-center justify-end">
						{asset.balance !== undefined &&
						asset.metadata?.decimals !== undefined ? (
							formatValue(asset.balance, asset.metadata.decimals)
						) : (
							<span className="text-tertiary">…</span>
						)}
					</span>
					<span className="px-2 py-1.5 flex items-center justify-end">
						<button
							type="button"
							className="text-[11px] font-medium bg-accent text-white rounded-md px-[8px] py-[3px] cursor-pointer press-down hover:bg-accent/90"
						>
							Send
						</button>
					</span>
				</div>
			))}
		</div>
	)
}

function ActivityList({
	transactions,
	address,
}: {
	transactions: Transaction[]
	address: string
}) {
	if (transactions.length === 0) {
		return (
			<div className="text-sm text-secondary">
				<p>No activity yet.</p>
			</div>
		)
	}

	return (
		<div className="text-[13px] -mx-2">
			{transactions.map((tx, index) => {
				const isSent =
					tx.from &&
					Address.isEqual(
						tx.from as Address.Address,
						address as Address.Address,
					)
				const otherAddress = isSent ? tx.to : tx.from
				const value = tx.value ? Hex.toBigInt(tx.value as Hex.Hex) : 0n

				return (
					<a
						key={tx.hash}
						href={`https://explore.tempo.xyz/tx/${tx.hash}`}
						target="_blank"
						rel="noopener noreferrer"
						className={cx(
							'flex items-center gap-2 px-2 py-2 hover:bg-base-alt transition-colors',
							index < transactions.length - 1 &&
								'border-b border-dashed border-card-border',
						)}
					>
						<span
							className={cx(
								'size-4 rounded-full flex items-center justify-center',
								isSent ? 'bg-negative/20' : 'bg-positive/20',
							)}
						>
							{isSent ? (
								<ArrowUpRightIcon className="size-2 text-negative" />
							) : (
								<ArrowDownLeftIcon className="size-2 text-positive" />
							)}
						</span>
						<span className="flex-1">
							<span className={isSent ? 'text-negative' : 'text-positive'}>
								{isSent ? 'Sent' : 'Received'}
							</span>
							{otherAddress && (
								<span className="text-tertiary ml-1">
									{isSent ? 'to' : 'from'}{' '}
									<span className="font-mono">
										{otherAddress.slice(0, 6)}…{otherAddress.slice(-4)}
									</span>
								</span>
							)}
						</span>
						{value > 0n && (
							<span className="text-secondary font-mono">
								{formatUnits(value, 18).slice(0, 8)}
							</span>
						)}
						<ExternalLinkIcon className="size-1.5 text-tertiary" />
					</a>
				)
			})}
			<a
				href={`https://explore.tempo.xyz/address/${address}`}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center justify-center gap-1 px-2 py-2 text-accent hover:text-accent/80 transition-colors"
			>
				<span>View all on Explorer</span>
				<ExternalLinkIcon className="size-1.5" />
			</a>
		</div>
	)
}
