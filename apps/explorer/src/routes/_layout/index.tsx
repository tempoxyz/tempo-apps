import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import type { Address, Hex } from 'ox'
import * as React from 'react'
import { cx } from 'zyzz'
import * as z from 'zod/mini'
import { ExploreInput } from '#comps/ExploreInput'
import { getTempoEnv } from '#lib/env'
import { link, pressDown, transitionColors } from '#styles/explorer'
import BoxIcon from '~icons/lucide/box'
import CoinsIcon from '~icons/lucide/coins'
import FileIcon from '~icons/lucide/file'
import ReceiptIcon from '~icons/lucide/receipt'
import UserIcon from '~icons/lucide/user'
import { styles } from './-index.styles'

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
			'0x334d04f62d5e48cee0171396adc95b7f36cef999f95be9e96c5ee42877a057e5',
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
		<div {...styles.page()}>
			<div {...styles.hero()}>
				<div {...styles.words()}>
					<LandingWords />
				</div>
			</div>
			<div {...styles.body()}>
				<div {...styles.search()}>
					<ExploreInput
						autoFocus
						size="large"
						wide
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
		<section {...styles.spotlight()}>
			<div {...styles.pills()}>
				{spotlightData && (
					<>
						<SpotlightPill
							to="/address/$address"
							params={{ address: spotlightData.accountAddress }}
							icon={<UserIcon {...cx(styles.pillIcon(), link())} />}
						>
							Account
						</SpotlightPill>
						<SpotlightPill
							to="/address/$address"
							params={{
								address: spotlightData.contractAddress,
							}}
							search={{ tab: 'contract' }}
							icon={<FileIcon {...cx(styles.pillIcon(), link())} />}
						>
							Contract
						</SpotlightPill>
						<SpotlightPill
							to="/receipt/$hash"
							params={{ hash: spotlightData.receiptHash }}
							icon={<ReceiptIcon {...cx(styles.pillIcon(), link())} />}
						>
							Receipt
						</SpotlightPill>
					</>
				)}
				<SpotlightPill
					to="/blocks"
					icon={<BoxIcon {...cx(styles.pillIcon(), link())} />}
				>
					Blocks
				</SpotlightPill>
				<SpotlightPill
					to="/tokens"
					icon={<CoinsIcon {...cx(styles.pillIcon(), link())} />}
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
			{...cx(styles.pill({ className }), transitionColors(), pressDown())}
		>
			{icon}
			<span>{children}</span>
		</Link>
	)
}

function LandingWords(): React.JSX.Element {
	return (
		<h1 {...styles.landingWords()}>
			<span {...styles.wordSearch()}>Search</span>
			<span {...styles.wordExplore()}>Explore</span>
			<span {...styles.wordDiscover()}>Discover</span>
		</h1>
	)
}
