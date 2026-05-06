import { createFileRoute, Link } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import * as React from 'react'
import * as z from 'zod/mini'
import { LandingBento } from '#comps/bento/LandingBento'
import { LiveStatus } from '#comps/bento/LiveStatus'
import { HeroSection } from '#comps/HeroSection'
import { cx } from '#lib/css'
import { getTempoEnv, hasIndexSupply } from '#lib/env'
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
		contractAddress: '0x3e44E7C5AAc48Cc0ed6f74D191bd465674571745',
		receiptHash:
			'0x48b138255c60bf0e2c6bcede32768398f679a213a6a7a7973aa71a8afd89c506',
	},
	mainnet: {
		accountAddress: '0xdf25f88aa6cde9937fdcfcf10fa349528c79dbf9',
		contractAddress: '0x20c000000000000000000000b9537d11c60e8b50',
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
	loader: () => {
		// Tile queries are intentionally not prefetched here — TanStack
		// Start's SSR streaming awaits them, which can stall the response
		// when tidx is slow (and our queries can each take seconds). Tiles
		// hydrate client-side and show skeletons until ready.
	},
})

function Component() {
	const { q } = Route.useSearch()
	const query = q?.trim() ?? ''
	const [inputValue, setInputValue] = React.useState(query)

	React.useEffect(() => {
		setInputValue(query)
	}, [query])

	return (
		<div className="flex flex-1 w-full flex-col text-[16px]">
			<div className="mx-auto w-full max-w-[1240px] px-4">
				<HeroSection searchValue={inputValue} onSearchChange={setInputValue} />
				<div className="flex flex-col items-center -mt-4 mb-6">
					<SpotlightLinks />
				</div>
			</div>
			{hasIndexSupply() ? (
				<section className="relative z-10 mx-auto w-full max-w-[1240px] px-4 pt-4 pb-20 motion-safe:animate-[fadeIn_600ms_ease-out_both]">
					<header className="mb-4 flex items-center justify-between">
						<h2 className="text-[13px] font-medium text-tertiary tracking-[0.02em]">
							Network at a glance
						</h2>
						<LiveStatus />
					</header>
					<LandingBento />
				</section>
			) : null}
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
