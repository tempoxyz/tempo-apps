import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import * as React from 'react'
import type { Block } from 'viem'
import * as z from 'zod/mini'
import { ExploreInput } from '#comps/ExploreInput'
import { Midcut } from '#comps/Midcut'
import { RelativeTime } from '#comps/RelativeTime'
import { cx } from '#lib/css'
import { getTempoEnv } from '#lib/env'
import { useLiveBlockNumber } from '#lib/block-number'
import {
	blocksQueryOptions,
	latestTransactionsQueryOptions,
	type TxWithBlock,
} from '#lib/queries'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import BoxIcon from '~icons/lucide/box'
import CoinsIcon from '~icons/lucide/coins'
import FileIcon from '~icons/lucide/file'
import ReceiptIcon from '~icons/lucide/receipt'
import UserIcon from '~icons/lucide/user'

const HOME_PANELS_COUNT = 6

const SPOTLIGHT_DATA: Record<
	string,
	{
		accountAddress: Address.Address
		contractAddress: Address.Address
		receiptHash: Hex.Hex
	}
> = {
	testnet: {
		accountAddress: '0xa726a1CD723409074DF9108A2187cfA19899aCF8',
		contractAddress: '0x3e44E7C5AAc48Cc0ed6f74D191bd465674571745',
		receiptHash:
			'0x48b138255c60bf0e2c6bcede32768398f679a213a6a7a7973aa71a8afd89c506',
	},
	mainnet: {
		accountAddress: '0xB48141c3Da5030deF992bDc686f0e9A8729206b6',
		contractAddress: '0x0901aED692C755b870F9605E56BAA66C35BEfF69',
		receiptHash:
			'0xa26f2dc8ed22d65ad5e5b3acc40295d89c331fd1e79d34b13baa3f6f47b136dc',
	},
}

function getSpotlightData() {
	return SPOTLIGHT_DATA[getTempoEnv()]
}

export const Route = createFileRoute('/_layout/')({
	component: Component,
	validateSearch: z.object({
		q: z.optional(z.coerce.string()),
	}).parse,
})

function Component() {
	const navigate = useNavigate()
	const { q } = Route.useSearch()
	const query = q?.trim() ?? ''
	const [inputValue, setInputValue] = React.useState(query)

	React.useEffect(() => {
		setInputValue(query)
	}, [query])

	return (
		<div className="flex flex-1 w-full flex-col text-[16px]">
			<div className="flex min-h-[30svh] flex-col justify-end">
				<div className="flex justify-center select-none [@media(max-height:360px)]:hidden">
					<LandingWords />
				</div>
			</div>
			<div className="flex flex-col items-center px-4 pt-8 gap-6">
				<div className="w-full max-w-[560px] relative z-20">
					<ExploreInput
						autoFocus
						size="large"
						wide
						className="bg-base-alt"
						value={inputValue}
						onChange={setInputValue}
						onActivate={(data) => {
							if (data.type === 'block') {
								navigate({
									to: '/block/$id',
									params: { id: data.value },
								})
								return
							}
							if (data.type === 'hash') {
								navigate({
									to: '/tx/$hash',
									params: { hash: data.value },
								})
								return
							}
							if (data.type === 'token') {
								navigate({
									to: '/token/$address',
									params: { address: data.value },
								})
								return
							}
							if (data.type === 'address') {
								navigate({
									to: '/address/$address',
									params: { address: data.value },
								})
								return
							}
						}}
					/>
				</div>
				<SpotlightLinks />
			</div>

			<div className="w-full max-w-300 mx-auto px-4 pt-8 pb-16 grid grid-cols-1 md:grid-cols-2 gap-4">
				<LatestBlocksPanel />
				<LatestTransactionsPanel />
			</div>
		</div>
	)
}

function LatestBlocksPanel() {
	const { data, refetch } = useQuery(blocksQueryOptions())
	const liveBlockNumber = useLiveBlockNumber()
	const prevLiveBlockRef = React.useRef<bigint | undefined>(undefined)

	React.useEffect(() => {
		if (liveBlockNumber == null) return
		if (prevLiveBlockRef.current === liveBlockNumber) return
		prevLiveBlockRef.current = liveBlockNumber
		refetch()
	}, [liveBlockNumber, refetch])

	const blocks = (data?.blocks ?? []).slice(0, HOME_PANELS_COUNT)

	return (
		<PanelCard
			title="Latest Blocks"
			icon={<BoxIcon className="size-[14px] text-accent" />}
			viewAllTo="/blocks"
		>
			{blocks.length === 0 ? (
				<div className="px-4 py-8 text-center text-[13px] text-tertiary">
					Loading…
				</div>
			) : (
				<div className="divide-y divide-base-border">
					{blocks.map((block) => (
						<BlockRow key={block.number?.toString()} block={block} />
					))}
				</div>
			)}
		</PanelCard>
	)
}

function BlockRow({ block }: { block: Block }) {
	const blockNumber = block.number?.toString() ?? '0'
	const txCount = block.transactions?.length ?? 0

	return (
		<Link
			to="/block/$id"
			params={{ id: blockNumber }}
			className="flex items-center justify-between px-4 py-2.5 hover:bg-base-alt/50 transition-colors gap-3"
		>
			<div className="flex items-center gap-3 min-w-0">
				<div className="shrink-0 flex items-center justify-center size-9 rounded-lg bg-base-alt border border-base-border">
					<BoxIcon className="size-4 text-accent" />
				</div>
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="text-[13px] font-medium text-accent tabular-nums">
						#{blockNumber}
					</span>
					<RelativeTime
						timestamp={block.timestamp}
						className="text-[11px] text-tertiary"
					/>
				</div>
			</div>
			<span className="text-[12px] text-secondary tabular-nums shrink-0">
				{txCount} {txCount === 1 ? 'txn' : 'txns'}
			</span>
		</Link>
	)
}

function LatestTransactionsPanel() {
	const { data: txs, refetch } = useQuery(latestTransactionsQueryOptions())
	const liveBlockNumber = useLiveBlockNumber()
	const prevLiveBlockRef = React.useRef<bigint | undefined>(undefined)

	React.useEffect(() => {
		if (liveBlockNumber == null) return
		if (prevLiveBlockRef.current === liveBlockNumber) return
		prevLiveBlockRef.current = liveBlockNumber
		refetch()
	}, [liveBlockNumber, refetch])

	return (
		<PanelCard
			title="Latest Transactions"
			icon={<ReceiptIcon className="size-[14px] text-accent" />}
			viewAllTo="/transactions"
		>
			{txs == null ? (
				<div className="px-4 py-8 text-center text-[13px] text-tertiary">
					Loading…
				</div>
			) : txs.length === 0 ? (
				<div className="px-4 py-8 text-center text-[13px] text-tertiary">
					No recent transactions.
				</div>
			) : (
				<div className="divide-y divide-base-border">
					{txs.map((tx) => (
						<TxRow key={tx.hash} tx={tx} />
					))}
				</div>
			)}
		</PanelCard>
	)
}

function TxRow({ tx }: { tx: TxWithBlock }) {
	return (
		<Link
			to="/receipt/$hash"
			params={{ hash: tx.hash as Hex.Hex }}
			className="flex items-center justify-between px-4 py-2.5 hover:bg-base-alt/50 transition-colors gap-3"
		>
			<div className="flex items-center gap-3 min-w-0">
				<div className="shrink-0 flex items-center justify-center size-9 rounded-lg bg-base-alt border border-base-border">
					<ReceiptIcon className="size-4 text-accent" />
				</div>
				<div className="flex flex-col gap-0.5 min-w-0">
					<div className="w-32 text-[13px] text-accent font-mono">
						<Midcut value={tx.hash as string} prefix="0x" />
					</div>
					<div className="flex items-center gap-1 text-[11px] text-tertiary">
						<span>
							{tx.to ? (
								<span className="flex items-center gap-1">
									<span className="opacity-60">From</span>
									<span className="w-20 font-mono inline-block">
										<Midcut value={tx.from as string} prefix="0x" />
									</span>
								</span>
							) : (
								<span className="text-accent/70">Contract creation</span>
							)}
						</span>
					</div>
				</div>
			</div>
			<RelativeTime
				timestamp={tx.blockTimestamp}
				className="text-[12px] text-secondary shrink-0"
			/>
		</Link>
	)
}

function PanelCard({
	title,
	icon,
	viewAllTo,
	children,
}: {
	title: string
	icon: React.ReactNode
	viewAllTo: string
	children: React.ReactNode
}) {
	return (
		<div className="flex flex-col border border-base-border rounded-xl overflow-hidden bg-card">
			<div className="flex items-center justify-between px-4 py-3 border-b border-base-border">
				<div className="flex items-center gap-2">
					{icon}
					<span className="text-[13px] font-semibold text-primary">
						{title}
					</span>
				</div>
				<Link
					to={viewAllTo}
					className="flex items-center gap-1 text-[12px] text-accent hover:text-accent/80 transition-colors"
				>
					View all
					<ArrowRightIcon className="size-3" />
				</Link>
			</div>
			{children}
		</div>
	)
}

function SpotlightLinks() {
	const spotlightData = getSpotlightData()

	return (
		<section className="text-center max-w-[500px] px-4">
			<div className="group/pills flex items-center gap-2 text-[13px] flex-wrap justify-center">
				{spotlightData && (
					<>
						<SpotlightPill
							to="/address/$address"
							params={{ address: spotlightData.accountAddress }}
							icon={<UserIcon className="size-[14px] text-accent" />}
						>
							Account
						</SpotlightPill>
						<SpotlightPill
							to="/address/$address"
							params={{
								address: spotlightData.contractAddress,
							}}
							search={{ tab: 'contract' }}
							icon={<FileIcon className="size-[14px] text-accent" />}
						>
							Contract
						</SpotlightPill>
						<SpotlightPill
							to="/receipt/$hash"
							params={{ hash: spotlightData.receiptHash }}
							icon={<ReceiptIcon className="size-[14px] text-accent" />}
						>
							Receipt
						</SpotlightPill>
					</>
				)}
				<SpotlightPill
					to="/blocks"
					icon={<BoxIcon className="size-[14px] text-accent" />}
				>
					Blocks
				</SpotlightPill>
				<SpotlightPill
					to="/tokens"
					icon={<CoinsIcon className="size-[14px] text-accent" />}
				>
					Tokens
				</SpotlightPill>
			</div>
		</section>
	)
}

function SpotlightPill(props: {
	className?: string
	to: string
	params?: Record<string, string>
	search?: Record<string, string>
	icon: React.ReactNode
	children: React.ReactNode
}) {
	const { className, to, params, search, icon, children } = props
	return (
		<Link
			to={to}
			{...(params ? { params } : {})}
			{...(search ? { search } : {})}
			preload="render"
			className={cx(
				'flex items-center gap-1.5 text-base-content-secondary hover:text-base-content border hover:border-accent focus-visible:border-accent px-2.5 py-1 rounded-full! press-down bg-surface focus-visible:outline-none border-base-border',
				className,
			)}
		>
			{icon}
			<span>{children}</span>
		</Link>
	)
}

function LandingWords() {
	return (
		<div className="flex flex-col items-center gap-1">
			<span className="text-[32px] font-semibold tracking-[-0.02em] leading-[0.95] text-primary/50">
				Search
			</span>
			<span className="text-[40px] font-semibold tracking-[-0.02em] leading-[0.95] text-primary/70">
				Explore
			</span>
			<span className="text-[52px] font-semibold tracking-[-0.02em] leading-[0.95] text-primary">
				Discover
			</span>
		</div>
	)
}
