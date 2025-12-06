import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ExploreInput } from '#components/ui/ExploreInput'
import { Intro } from '#components/ui/Intro'

export const Route = createFileRoute('/_layout/')({
	component: Component,
})

function Component() {
	const router = useRouter()
	const navigate = useNavigate()
	const [inputValue, setInputValue] = useState('')
	const [isMounted, setIsMounted] = useState(false)
	const isNavigating = useRouterState({
		select: (state) => state.status === 'pending',
	})

	useEffect(() => setIsMounted(true), [])

	useEffect(() => {
		return router.subscribe('onResolved', ({ hrefChanged }) => {
			if (hrefChanged) setInputValue('')
		})
	}, [router])

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
						disabled={isMounted && isNavigating}
						onActivate={(data) => {
							if (data.type === 'hash') {
								navigate({ to: '/tx/$hash', params: { hash: data.value } })
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
	return (
		<section className="text-center">
			<span className="text-sm font-medium text-base-content-tertiary">
				Try
			</span>
			<div className="flex items-center gap-[8px] mt-2 text-[14px] text-base-content-tertiary">
				<SpotlightLink
					to="/address/$address"
					params={{ address: '0x5bc1473610754a5ca10749552b119df90c1a1877' }}
				>
					Account
				</SpotlightLink>
				<span>·</span>
				<SpotlightLink to="/blocks">Blocks</SpotlightLink>
				<span>·</span>
				<SpotlightLink to="/tokens">Tokens</SpotlightLink>
				<span>·</span>
				<SpotlightLink
					to="/receipt/$hash"
					params={{
						hash: '0x6d6d8c102064e6dee44abad2024a8b1d37959230baab80e70efbf9b0c739c4fd',
					}}
				>
					Receipt
				</SpotlightLink>
				<span>·</span>
				<SpotlightLink
					to="/tx/$hash"
					params={{
						hash: '0x6d6d8c102064e6dee44abad2024a8b1d37959230baab80e70efbf9b0c739c4fd',
					}}
				>
					Tx
				</SpotlightLink>
				<span>·</span>
				<SpotlightLink
					to="/address/$address"
					params={{
						address: '0x20fc000000000000000000000000000000000000',
					}}
				>
					Contract
				</SpotlightLink>
			</div>
		</section>
	)
}

function SpotlightLink(props: {
	to: string
	params?: Record<string, string>
	children: React.ReactNode
}) {
	const { to, params, children } = props
	return (
		<Link
			to={to}
			{...(params ? { params } : {})}
			className="text-base-content-secondary hover:text-base-content transition-colors duration-150 underline underline-offset-2 decoration-base-border hover:decoration-base-content-secondary"
		>
			{children}
		</Link>
	)
}
