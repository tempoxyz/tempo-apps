import {
	createFileRoute,
	getRouteApi,
	Link,
	useNavigate,
} from '@tanstack/react-router'
import type { Hex } from 'ox'
import { useState } from 'react'
import { ExploreInput } from '#components/ExploreInput'
import { Intro } from '#components/Intro'
import * as Tip20 from '#lib/tip20'

const layoutRoute = getRouteApi('/_layout')

export const Route = createFileRoute('/_layout/')({
	component: Component,
})

function Component() {
	const navigate = useNavigate()
	const [inputValue, setInputValue] = useState('')
	const { recentTransactions } = layoutRoute.useLoaderData()

	return (
		<div className="flex flex-1 size-full items-center justify-center text-[16px]">
			<div className="grid place-items-center relative grid-flow-row gap-[20px] select-none w-full pt-[60px] pb-[40px] z-1">
				<Intro />
				<p className="text-base-content-secondary max-w-[260px] text-center">
					View account history and transaction details on Tempo.
				</p>
				<div className="px-[16px] w-full flex justify-center">
					<ExploreInput
						autoFocus
						size="large"
						value={inputValue}
						onChange={setInputValue}
						onActivate={() => {
							// TODO: search screen?
							// navigate({ to: '/search/$value', params: { value } })
						}}
						onAddress={(address) => {
							navigate({
								to: Tip20.isTip20Address(address)
									? '/token/$address'
									: '/address/$address',
								params: { address },
							})
						}}
						onHash={(hash) => {
							navigate({ to: '/tx/$hash', params: { hash } })
						}}
						onBlock={(block) => {
							navigate({ to: '/block/$id', params: { id: block } })
						}}
					/>
				</div>
				<SpotlightLinks recentTransactions={recentTransactions} />
			</div>
		</div>
	)
}

function SpotlightLinks(props: { recentTransactions?: Hex.Hex[] }) {
	const { recentTransactions = [] } = props
	return (
		<div className="flex items-center gap-[8px] mt-[24px] text-[14px] text-base-content-tertiary">
			<span>Try:</span>
			<SpotlightLink
				to="/address/$address"
				params={{ address: '0x5bc1473610754a5ca10749552b119df90c1a1877' }}
			>
				Account
			</SpotlightLink>
			<span>·</span>
			<SpotlightLink
				to="/token/$address"
				params={{ address: '0x20c0000000000000000000000000000000000002' }}
			>
				Token
			</SpotlightLink>
			<span>·</span>
			{recentTransactions[0] ? (
				<SpotlightLink to="/tx/$hash" params={{ hash: recentTransactions[0] }}>
					Receipt
				</SpotlightLink>
			) : (
				<span className="opacity-50">Receipt</span>
			)}
		</div>
	)
}

function SpotlightLink(props: {
	to: string
	params: Record<string, string>
	children: React.ReactNode
}) {
	const { to, params, children } = props
	return (
		<Link
			to={to}
			params={params}
			className="text-base-content-secondary hover:text-base-content transition-colors duration-150 underline underline-offset-2 decoration-base-border hover:decoration-base-content-secondary"
		>
			{children}
		</Link>
	)
}
