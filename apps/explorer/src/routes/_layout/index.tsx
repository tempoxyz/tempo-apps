import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { animate, stagger } from 'animejs'
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { cx } from '#cva.config'
import { springInstant, springBouncy, springSmooth } from '#lib/animation'
import { Intro, type IntroPhase } from '#comps/Intro'
import BoxIcon from '~icons/lucide/box'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import CoinsIcon from '~icons/lucide/coins'
import FileIcon from '~icons/lucide/file'
import ReceiptIcon from '~icons/lucide/receipt'
import ShuffleIcon from '~icons/lucide/shuffle'
import UserIcon from '~icons/lucide/user'
import ZapIcon from '~icons/lucide/zap'

export const Route = createFileRoute('/_layout/')({
	component: Component,
})

function Component() {
	const router = useRouter()
	const navigate = useNavigate()
	const [inputValue, setInputValue] = useState('')
	const [isMounted, setIsMounted] = useState(false)
	const [introPhase, setIntroPhase] = useState<IntroPhase>('initial')
	const inputWrapperRef = useRef<HTMLDivElement>(null)
	const exploreInputRef = useRef<HTMLInputElement>(null)
	const isNavigating = useRouterState({
		select: (state) => state.status === 'pending',
	})

	useEffect(() => setIsMounted(true), [])

	useEffect(() => {
		return router.subscribe('onResolved', ({ hrefChanged }) => {
			if (hrefChanged) setInputValue('')
		})
	}, [router])

	useEffect(() => {
		if (introPhase === 'search' && inputWrapperRef.current)
			animate(inputWrapperRef.current, {
				opacity: [0, 1],
				scale: [0.94, 1],
				ease: springBouncy,
				delay: 240,
				onBegin: () => exploreInputRef.current?.focus(),
			})
	}, [introPhase])

	const handlePhaseChange = useCallback((phase: IntroPhase) => {
		setIntroPhase(phase)
	}, [])

	return (
		<div className="flex flex-1 size-full items-center justify-center text-[16px]">
			<div className="grid place-items-center relative grid-flow-row gap-5 select-none w-full pt-15 pb-10 z-1">
				<Intro onPhaseChange={handlePhaseChange} />
				<div className="w-full overflow-hidden">
					<div
						ref={inputWrapperRef}
						className="px-4 w-full flex justify-center relative z-20"
						style={{ opacity: 0 }}
					>
						<ExploreInput
							inputRef={exploreInputRef}
							size="large"
							value={inputValue}
							onChange={setInputValue}
							disabled={isMounted && isNavigating}
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
				<SpotlightLinks introPhase={introPhase} />
			</div>
		</div>
	)
}

function SpotlightLinks({ introPhase }: { introPhase: IntroPhase }) {
	const navigate = useNavigate()
	const [actionOpen, setActionOpen] = useState(false)
	const [menuMounted, setMenuMounted] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)
	const dropdownMenuRef = useRef<HTMLDivElement>(null)
	const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const closingRef = useRef(false)
	const pillsRef = useRef<HTMLDivElement>(null)
	const animatedRef = useRef(false)

	const closeMenu = useCallback(() => {
		setActionOpen(false)
		if (dropdownMenuRef.current) {
			closingRef.current = true
			animate(dropdownMenuRef.current, {
				opacity: [1, 0],
				scale: [1, 0.97],
				translateY: [0, -4],
				ease: springInstant,
			}).then(() => {
				if (!closingRef.current) return
				setMenuMounted(false)
			})
		} else {
			setMenuMounted(false)
		}
	}, [])

	useEffect(() => {
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

	useEffect(() => {
		if (introPhase === 'search' && !animatedRef.current && pillsRef.current) {
			animatedRef.current = true
			const children = Array.from(pillsRef.current.children)
			for (const child of children) {
				;(child as HTMLElement).style.pointerEvents = 'auto'
			}
			animate(children, {
				opacity: [0, 1],
				translateY: [4, 0],
				ease: springSmooth,
				delay: stagger(20, {
					start: 320,
					from: 'random',
				}),
			}).then(() => {
				// clear transform, otherwise .press-down would not work
				for (const child of children) {
					;(child as HTMLElement).style.transform = ''
				}
			})
		}
	}, [introPhase])

	useEffect(() => {
		if (actionOpen) setMenuMounted(true)
	}, [actionOpen])

	useLayoutEffect(() => {
		if (!dropdownMenuRef.current) return
		if (actionOpen && menuMounted) {
			animate(dropdownMenuRef.current, {
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
			animate(dropdownMenuRef.current, {
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

	const actionTypes = [
		{
			label: 'Payment',
			hash: '0x33cdfc39dcda535aac88e7fe3a79954e0740ec26a2fe54eb5481a4cfc0cb8024' as const,
		},
		{
			label: 'Swap',
			hash: '0x8b6cdb1f6193c17a3733aec315441ab92bca3078b462b27863509a279a5ea6e0' as const,
		},
		{
			label: 'Mint',
			hash: '0xe5c909ef42674965a8b805118f08b58f215a98661838ae187737841531097b70' as const,
		},
	]

	return (
		<section className="text-center max-w-[500px] px-4">
			<div
				ref={pillsRef}
				className="group/pills flex items-center gap-2 text-[13px] flex-wrap justify-center"
			>
				<SpotlightPill
					to="/address/$address"
					params={{ address: '0x5bc1473610754a5ca10749552b119df90c1a1877' }}
					icon={<UserIcon className="size-[14px] text-accent" />}
					badge={<ShuffleIcon className="size-[10px] text-secondary" />}
				>
					Account
				</SpotlightPill>
				<SpotlightPill
					to="/address/$address"
					params={{ address: '0xe4b10A2a727D0f4863CEBca743a8dAb84cf65b2d' }}
					search={{ tab: 'contract' }}
					icon={<FileIcon className="size-[14px] text-accent" />}
					badge={<ShuffleIcon className="size-[10px] text-secondary" />}
				>
					Contract
				</SpotlightPill>
				<SpotlightPill
					to="/receipt/$hash"
					params={{
						hash: '0x6d6d8c102064e6dee44abad2024a8b1d37959230baab80e70efbf9b0c739c4fd',
					}}
					icon={<ReceiptIcon className="size-[14px] text-accent" />}
				>
					Receipt
				</SpotlightPill>
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
									<button
										key={action.label}
										type="button"
										onClick={() => {
											navigate({
												to: '/tx/$hash',
												params: { hash: action.hash },
											})
											setMenuMounted(false)
											setActionOpen(false)
										}}
										className={`px-2.5 py-1 text-[12px] text-base-content-secondary hover:text-base-content hover:bg-base-border/40 whitespace-nowrap focus-visible:outline-offset-0 press-down cursor-pointer ${
											i === 0
												? 'rounded-l-[14px]! rounded-r-[2px]!'
												: i === actionTypes.length - 1
													? 'rounded-r-[14px]! rounded-l-[2px]!'
													: 'rounded-[2px]!'
										}`}
									>
										{action.label}
									</button>
								))}
							</div>
						</div>
					)}
				</div>
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
	to: string
	params?: Record<string, string>
	search?: Record<string, string>
	icon: React.ReactNode
	badge?: React.ReactNode
	children: React.ReactNode
}) {
	const { to, params, search, icon, badge, children } = props
	return (
		<Link
			to={to}
			{...(params ? { params } : {})}
			{...(search ? { search } : {})}
			className={cx(
				'relative flex items-center gap-1.5 text-base-content-secondary hover:text-base-content border hover:border-accent focus-visible:border-accent py-1 rounded-full! press-down group-hover/pills:opacity-40 hover:opacity-100 bg-surface focus-visible:outline-none border-base-border transition-colors duration-300 ease-out focus-visible:duration-0',
				badge ? 'pl-2.5 pr-4' : 'px-2.5',
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
