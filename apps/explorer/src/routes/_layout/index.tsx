import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { ExploreInput } from '#comps/ExploreInput'

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
		<div className="flex flex-1 size-full items-center justify-center text-[16px]">
			<div className="grid place-items-center relative grid-flow-row gap-8 select-none w-full z-1">
				<div className="[@media(max-height:500px)]:hidden">
					<LandingWords />
				</div>
				<div className="w-full px-4 flex justify-center relative z-20">
					<div className="w-full max-w-[560px]">
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
				</div>
			</div>
		</div>
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
