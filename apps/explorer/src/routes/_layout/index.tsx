import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import * as React from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { cx } from '#lib/css'
import BoxIcon from '~icons/lucide/box'
import CoinsIcon from '~icons/lucide/coins'

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
			<div className="flex grow flex-col items-center px-4 pt-8 gap-3">
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
				<QuickAccessPills />
			</div>
		</div>
	)
}

function QuickAccessPills() {
	return (
		<div className="flex items-center gap-2 text-[13px]">
			<QuickAccessPill
				to="/blocks"
				icon={<BoxIcon className="size-[14px] text-accent" />}
			>
				Blocks
			</QuickAccessPill>
			<QuickAccessPill
				to="/tokens"
				icon={<CoinsIcon className="size-[14px] text-accent" />}
			>
				Tokens
			</QuickAccessPill>
		</div>
	)
}

function QuickAccessPill(props: {
	className?: string
	to: string
	icon: React.ReactNode
	children: React.ReactNode
}) {
	const { className, to, icon, children } = props
	return (
		<Link
			to={to}
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
