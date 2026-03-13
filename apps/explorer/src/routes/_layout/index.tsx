import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import * as React from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { cx } from '#lib/css'
import { getTempoEnv } from '#lib/env'
import BoxIcon from '~icons/lucide/box'
import CoinsIcon from '~icons/lucide/coins'
import FileIcon from '~icons/lucide/file'
import ReceiptIcon from '~icons/lucide/receipt'
import UserIcon from '~icons/lucide/user'

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
		contractAddress: '0x20c0000000000000000000000000000000000001',
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
})

function Component() {
	const router = useRouter()
	const navigate = useNavigate()
	const [inputValue, setInputValue] = React.useState('')

	React.useEffect(() => {
		return router.subscribe('onResolved', ({ hrefChanged }) => {
			if (hrefChanged) setInputValue('')
		})
	}, [router])

	return (
		<div className="flex flex-1 w-full flex-col text-[16px]">
			<div className="flex min-h-[42svh] flex-col justify-end">
				<div className="flex justify-center select-none [@media(max-height:360px)]:hidden">
					<LandingWords />
				</div>
			</div>
			<div className="flex grow flex-col items-center px-4 pt-8 gap-8">
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
									to: '/receipt/$hash',
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
							search={{ tab: 'transactions' }}
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
