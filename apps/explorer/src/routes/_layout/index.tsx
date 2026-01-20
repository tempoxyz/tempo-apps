import {
	createFileRoute,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { waapi } from 'animejs'
import * as React from 'react'
import { Dashboard } from '#comps/Dashboard'
import { ExploreInput } from '#comps/ExploreInput'
import { springInstant, springBouncy } from '#lib/animation'
import { Intro, type IntroPhase, useIntroSeen } from '#comps/Intro'

export const Route = createFileRoute('/_layout/')({
	component: Component,
})

function Component() {
	const router = useRouter()
	const navigate = useNavigate()
	const introSeen = useIntroSeen()
	const introSeenOnMount = React.useRef(introSeen)
	const [inputValue, setInputValue] = React.useState('')
	const [isMounted, setIsMounted] = React.useState(false)
	const [inputReady, setInputReady] = React.useState(false)
	const [dashboardVisible, setDashboardVisible] = React.useState(false)
	const exploreInputRef = React.useRef<HTMLInputElement>(null)
	const exploreWrapperRef = React.useRef<HTMLDivElement>(null)
	const isNavigating = useRouterState({
		select: (state) => state.status === 'pending',
	})

	React.useEffect(() => setIsMounted(true), [])

	React.useEffect(() => {
		return router.subscribe('onResolved', ({ hrefChanged }) => {
			if (hrefChanged) setInputValue('')
		})
	}, [router])

	const handlePhaseChange = React.useCallback((phase: IntroPhase) => {
		if (phase !== 'start' || !exploreWrapperRef.current) return

		const seen = introSeenOnMount.current
		setTimeout(
			() => {
				setInputReady(true)
				setDashboardVisible(true)
				if (exploreWrapperRef.current) {
					exploreWrapperRef.current.style.pointerEvents = 'auto'
					waapi.animate(exploreWrapperRef.current, {
						opacity: [0, 1],
						scale: [seen ? 0.97 : 0.94, 1],
						ease: seen ? springInstant : springBouncy,
					})
				}
				exploreInputRef.current?.focus()
			},
			seen ? 0 : 240,
		)
	}, [])

	return (
		<div className="flex flex-1 flex-col size-full items-center text-[16px]">
			<div className="grid place-items-center relative grid-flow-row gap-5 select-none w-full pt-15 pb-6 z-1">
				<Intro onPhaseChange={handlePhaseChange} />
				<div className="w-full my-3 px-4 flex justify-center relative z-20">
					<ExploreInput
						inputRef={exploreInputRef}
						wrapperRef={exploreWrapperRef}
						size="large"
						value={inputValue}
						onChange={setInputValue}
						disabled={isMounted && isNavigating}
						tabIndex={inputReady ? 0 : -1}
						onActivate={(data) => {
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
			<Dashboard visible={dashboardVisible} />
		</div>
	)
}
