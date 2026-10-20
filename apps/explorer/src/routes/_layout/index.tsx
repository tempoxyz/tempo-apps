import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
	Coins,
	Files,
	Package,
	Receipt,
	SwapHorizontal,
	User,
} from '@tempoxyz/ds/icons'
import type { Address, Hex } from 'ox'
import * as React from 'react'
import * as z from 'zod/mini'
import { Button, style } from '@tempoxyz/ds'
import { ExploreInput } from '#comps/ExploreInput'
import { TempoWordmark } from '#comps/TempoWordmark'
import { getTempoEnv } from '#lib/env'
import { link } from '#styles/explorer'

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
	}),
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
				<h1 {...styles.logo()}>
					<TempoWordmark aria-label="Tempo Explorer" {...styles.wordmark()} />
				</h1>
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
							icon={<User {...link()} />}
						>
							Account
						</SpotlightPill>
						<SpotlightPill
							to="/address/$address"
							params={{
								address: spotlightData.contractAddress,
							}}
							search={{ tab: 'contract' }}
							icon={<Files {...link()} />}
						>
							Contract
						</SpotlightPill>
						<SpotlightPill
							to="/receipt/$hash"
							params={{ hash: spotlightData.receiptHash }}
							icon={<Receipt {...link()} />}
						>
							Receipt
						</SpotlightPill>
					</>
				)}
				<SpotlightPill to="/blocks" icon={<Package {...link()} />}>
					Blocks
				</SpotlightPill>
				<SpotlightPill to="/tokens" icon={<Coins {...link()} />}>
					Tokens
				</SpotlightPill>
				<SpotlightPill to="/dex" icon={<SwapHorizontal {...link()} />}>
					DEX
				</SpotlightPill>
			</div>
		</section>
	)
}

function SpotlightPill(props: {
	to: string
	params?: Record<string, string>
	search?: Record<string, string>
	icon: React.ReactNode
	children: React.ReactNode
}) {
	const { to, params, search, icon, children } = props
	return (
		<Button.Link
			render={
				<Link
					to={to}
					{...(params ? { params } : {})}
					{...(search ? { search } : {})}
				/>
			}
			size="small"
			variant="secondary"
		>
			{icon}
			<span>{children}</span>
		</Button.Link>
	)
}

namespace styles {
	export const page = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		typography: 'copy.16',
		width: '100% !custom',
	})

	export const hero = style({
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'flex-end',
		minHeight: '42svh !custom',
	})

	export const logo = style({
		color: 'foreground',
		display: 'flex',
		justifyContent: 'center',
		margin: '0',
		userSelect: 'none',
		'@media (height <= 360px)': { display: 'none' },
	})

	// Sized like a search engine's home logo; the header hides its own on this page.
	export const wordmark = style({
		display: 'block',
		height: '12',
		width: 'auto !custom',
		'@media (width >= 800px)': { height: '16' },
	})

	export const body = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		flexGrow: 1,
		gap: '8',
		paddingInline: '4',
		paddingTop: '8',
	})

	export const search = style({
		maxWidth: '560px !custom',
		position: 'relative',
		width: '100% !custom',
		zIndex: 20,
	})

	export const spotlight = style({
		maxWidth: '680px !custom',
		paddingInline: '4',
		textAlign: 'center',
	})

	export const pills = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '2',
		justifyContent: 'center',
	})
}
