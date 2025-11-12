import {
	createFileRoute,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router'
import { ExploreInput } from '#components/ExploreInput'
import { Intro } from '#components/Intro'
import { Sphere } from '#components/Sphere'

export const Route = createFileRoute('/_layout/')({
	component: Component,
})

export function Component() {
	const navigate = useNavigate()
	const state = useRouterState()
	return (
		<div className="flex flex-1 size-full items-center justify-center text-[16px]">
			<PositionedSphere />
			<div className="grid place-items-center relative grid-flow-row gap-[20px] select-none w-full pt-[60px] pb-[40px]">
				<Intro />
				<p className="text-base-content-secondary max-w-[260px] text-center">
					View account history and transaction details on Tempo.
				</p>
				<div className="px-[16px] w-full flex justify-center">
					<ExploreInput
						autoFocus
						size="large"
						onActivate={() => {
							// TODO: search screen?
							// navigate({ to: '/search/$value', params: { value } })
						}}
						onAddress={(address) => {
							navigate({ to: '/account/$address', params: { address } })
						}}
						onHash={(hash) => {
							navigate({ to: '/tx/$hash', params: { hash } })
						}}
						disabled={state.isLoading}
					/>
				</div>
			</div>
		</div>
	)
}

function PositionedSphere() {
	return (
		<div
			ref={(el) => {
				if (!el) return
				el.style.opacity = '1'
				el.style.transform = 'translate3d(0, 0, 0)'
			}}
			className="absolute -top-[240px] z-0 w-full flex justify-center pointer-events-none transition-[transform,opacity] duration-1000 ease-out"
			style={{
				opacity: 0,
				transform: 'translate3d(0, -8px, 0)',
			}}
		>
			<Sphere />
		</div>
	)
}
