import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { waapi, stagger } from 'animejs'
import type { Address, Hex } from 'ox'
import * as React from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { NetworkStats } from '#comps/NetworkStats'
import { cx } from '#lib/css'
import { springInstant, springBouncy, springSmooth } from '#lib/animation'
import { Intro, type IntroPhase, useIntroSeen } from '#comps/Intro'
import BoxIcon from '~icons/lucide/box'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CoinsIcon from '~icons/lucide/coins'
import FileIcon from '~icons/lucide/file'
import ReceiptIcon from '~icons/lucide/receipt'
import ShieldCheckIcon from '~icons/lucide/shield-check'
import ShuffleIcon from '~icons/lucide/shuffle'
import UserIcon from '~icons/lucide/user'
import ZapIcon from '~icons/lucide/zap'

const SPOTLIGHT_DATA: Record<
	string,
	{
		accountAddress: Address.Address
		contractAddress: Address.Address
		receiptHash: Hex.Hex | null
		paymentHash: Hex.Hex | null
		swapHash: Hex.Hex | null
		mintHash: Hex.Hex | null
	}
> = {
	testnet: {
		accountAddress: '0x5bc1473610754a5ca10749552b119df90c1a1877',
		contractAddress: '0x9b400b4c962463E840cCdbE2493Dc6Ab78768266',
		receiptHash:
			'0x6d6d8c102064e6dee44abad2024a8b1d37959230baab80e70efbf9b0c739c4fd',
		paymentHash:
			'0x33cdfc39dcda535aac88e7fe3a79954e0740ec26a2fe54eb5481a4cfc0cb8024',
		swapHash:
			'0x8b6cdb1f6193c17a3733aec315441ab92bca3078b462b27863509a279a5ea6e0',
		mintHash:
			'0xe5c909ef42674965a8b805118f08b58f215a98661838ae187737841531097b70',
	},
	moderato: {
		accountAddress: '0xa726a1CD723409074DF9108A2187cfA19899aCF8',
		contractAddress: '0x52db6B29F1032b55F1C28354055539b1931CB26e',
		receiptHash:
			'0x429eb0d8a4565138aec97fe11c8f2f4e56f26725e3a428881bbeba6c4e8ecdc9',
		paymentHash:
			'0x429eb0d8a4565138aec97fe11c8f2f4e56f26725e3a428881bbeba6c4e8ecdc9',
		swapHash:
			'0xc61b40cfc6714a893e3d758f2db3e19cd54f175369e17c48591654b294332cf9',
		mintHash:
			'0x58fcdd78477f7ee402320984e990e7a1623d80b768afb03f9b27fd2eac395032',
	},
	presto: {
		accountAddress: '0x85269497F0b602a718b85DB5ce490A6c88d01c0E',
		contractAddress: '0x4027a3f47d9a421c381bf5d88e22dad5afd4b1a2',
		receiptHash:
			'0x2e455936243560a540a1cf25203ef6bb70eb5410667922a1d2e3ad69eb891983',
		paymentHash:
			'0x2e455936243560a540a1cf25203ef6bb70eb5410667922a1d2e3ad69eb891983',
		swapHash: null,
		mintHash:
			'0xc2ecd6749cac0ddce9511cbffe91c2a3de7c2b93d28e35d2d57b7ef4380bc37b',
	},
}

const spotlightData = SPOTLIGHT_DATA[import.meta.env.VITE_TEMPO_ENV]

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
		<div className="flex flex-1 size-full items-center justify-center text-[16px]">
			<div className="grid place-items-center relative grid-flow-row gap-5 select-none w-full pt-15 pb-10 z-1">
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
				<SpotlightLinks />
				<NetworkStats />
			</div>
		</div>
	)
}

function SpotlightLinks() {
	const introSeen = useIntroSeen()
	const [actionOpen, setActionOpen] = React.useState(false)
	const [menuMounted, setMenuMounted] = React.useState(false)
	const dropdownRef = React.useRef<HTMLDivElement>(null)
	const dropdownMenuRef = React.useRef<HTMLDivElement>(null)
	const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
		null,
	)
	const closingRef = React.useRef(false)
	const pillsRef = React.useRef<HTMLDivElement>(null)
	const introSeenOnMount = React.useRef(introSeen)

	const closeMenu = React.useCallback(() => {
		setActionOpen(false)
		if (dropdownMenuRef.current) {
			closingRef.current = true
			waapi
				.animate(dropdownMenuRef.current, {
					opacity: [1, 0],
					scale: [1, 0.97],
					translateY: [0, -4],
					ease: springInstant,
				})
				.then(() => {
					if (!closingRef.current) return
					setMenuMounted(false)
				})
		} else {
			setMenuMounted(false)
		}
	}, [])

	React.useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				closeMenu()
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [closeMenu])

	React.useEffect(() => {
		if (!pillsRef.current) return
		const seen = introSeenOnMount.current
		const children = [...pillsRef.current.children]
		const delay = seen ? 0 : 320
		setTimeout(() => {
			for (const child of children) {
				;(child as HTMLElement).style.pointerEvents = 'auto'
			}
		}, delay)
		const anim = waapi.animate(children as HTMLElement[], {
			opacity: [0, 1],
			translateY: [seen ? 4 : 8, 0],
			scale: [0.97, 1],
			ease: seen ? springInstant : springSmooth,
			delay: seen ? stagger(10) : stagger(20, { start: delay, from: 'first' }),
		})
		anim.then(() => {
			for (const child of children) {
				;(child as HTMLElement).style.transform = ''
			}
		})
		return () => {
			try {
				anim.cancel()
			} catch {}
		}
	}, [])

	React.useEffect(() => {
		if (actionOpen) setMenuMounted(true)
	}, [actionOpen])

	React.useLayoutEffect(() => {
		if (!dropdownMenuRef.current) return
		if (actionOpen && menuMounted) {
			waapi.animate(dropdownMenuRef.current, {
				opacity: [0, 1],
				scale: [0.97, 1],
				translateY: [-4, 0],
				ease: springInstant,
			})
		}
	}, [actionOpen, menuMounted])

	const handleMouseEnter = () => {
		if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
		if (closingRef.current && dropdownMenuRef.current) {
			closingRef.current = false
			waapi.animate(dropdownMenuRef.current, {
				opacity: 1,
				scale: 1,
				ease: springInstant,
			})
		}
		setActionOpen(true)
	}

	const handleMouseLeave = () => {
		hoverTimeoutRef.current = setTimeout(() => closeMenu(), 150)
	}

	const actionTypes = spotlightData
		? [
				{ label: 'Payment', hash: spotlightData.paymentHash },
				{ label: 'Swap', hash: spotlightData.swapHash },
				{ label: 'Mint', hash: spotlightData.mintHash },
			].filter((a): a is { label: string; hash: Hex.Hex } => a.hash !== null)
		: []

	return (
		<section className="text-center max-w-[500px] px-4">
			<div
				ref={pillsRef}
				className="group/pills flex items-center gap-2 text-[13px] flex-wrap justify-center"
			>
				{spotlightData && (
					<>
						<SpotlightPill
							to="/address/$address"
							params={{ address: spotlightData.accountAddress }}
							icon={<UserIcon className="size-[14px] text-accent" />}
							badge={<ShuffleIcon className="size-[10px] text-secondary" />}
						>
							Account
						</SpotlightPill>
						<SpotlightPill
							to="/address/$address"
							params={{ address: spotlightData.contractAddress }}
							search={{ tab: 'contract' }}
							icon={<FileIcon className="size-[14px] text-accent" />}
							badge={<ShuffleIcon className="size-[10px] text-secondary" />}
						>
							Contract
						</SpotlightPill>
						{spotlightData.receiptHash && (
							<SpotlightPill
								to="/receipt/$hash"
								params={{ hash: spotlightData.receiptHash }}
								icon={<ReceiptIcon className="size-[14px] text-accent" />}
							>
								Receipt
							</SpotlightPill>
						)}
						{/** biome-ignore lint/a11y/noStaticElementInteractions: _ */}
						<div
							className="relative group-hover/pills:opacity-40 hover:opacity-100"
							ref={dropdownRef}
							onMouseEnter={handleMouseEnter}
							onMouseLeave={handleMouseLeave}
							style={{
								opacity: 0,
								pointerEvents: 'none',
								zIndex: actionOpen ? 100 : 'auto',
							}}
						>
							<button
								type="button"
								onClick={() => (actionOpen ? closeMenu() : setActionOpen(true))}
								className="flex items-center gap-1.5 text-base-content-secondary hover:text-base-content border border-base-border hover:border-accent focus-visible:border-accent px-2.5 py-1 rounded-full! press-down bg-surface focus-visible:outline-none cursor-pointer"
							>
								<ZapIcon className="size-[14px] text-accent" />
								<span>Action</span>
								<ChevronDownIcon
									className={`size-[12px] transition-transform ${
										actionOpen ? 'rotate-180' : ''
									}`}
								/>
							</button>
							{menuMounted && (
								<div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50">
									<div
										ref={dropdownMenuRef}
										className="bg-base-plane rounded-full p-1 border border-base-border shadow-xl flex items-center relative z-60"
										style={{ opacity: 0 }}
									>
										{actionTypes.map((action, i) => (
											<Link
												key={action.label}
												to="/tx/$hash"
												params={{ hash: action.hash }}
												className={`px-2.5 py-1 text-[12px] text-base-content-secondary hover:text-base-content hover:bg-base-border/40 whitespace-nowrap focus-visible:outline-offset-0 press-down cursor-pointer ${
													i === 0
														? 'rounded-l-[14px]! rounded-r-[2px]!'
														: i === actionTypes.length - 1
															? 'rounded-r-[14px]! rounded-l-[2px]!'
															: 'rounded-[2px]!'
												}`}
											>
												{action.label}
											</Link>
										))}
									</div>
								</div>
							)}
						</div>
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
				<SpotlightPill
					to="/validators"
					icon={<ShieldCheckIcon className="size-[14px] text-accent" />}
				>
					Validators
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
	badge?: React.ReactNode
	children: React.ReactNode
}) {
	const { className, to, params, search, icon, badge, children } = props
	return (
		<Link
			to={to}
			{...(params ? { params } : {})}
			{...(search ? { search } : {})}
			className={cx(
				'relative flex items-center gap-1.5 text-base-content-secondary hover:text-base-content border hover:border-accent focus-visible:border-accent py-1 rounded-full! press-down group-hover/pills:opacity-40 hover:opacity-100 bg-surface focus-visible:outline-none border-base-border transition-colors duration-300 ease-out focus-visible:duration-0',
				badge ? 'pl-2.5 pr-4' : 'px-2.5',
				className,
			)}
			style={{ opacity: 0, pointerEvents: 'none' }}
		>
			{icon}
			<span>{children}</span>
			{badge && (
				<span className="absolute -top-1.5 -right-1.5 size-[18px] flex items-center justify-center rounded-full bg-base-plane border border-base-border text-base-content">
					{badge}
				</span>
			)}
		</Link>
	)
}
