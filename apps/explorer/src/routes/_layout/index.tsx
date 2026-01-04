import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { Intro, type IntroPhase } from '#comps/Intro'
import { cx } from '#cva.config.ts'
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

const isTestnet = import.meta.env.VITE_TEMPO_ENV === 'testnet'

function Component() {
	const router = useRouter()
	const navigate = useNavigate()
	const [inputValue, setInputValue] = useState('')
	const [isMounted, setIsMounted] = useState(false)
	const [introPhase, setIntroPhase] = useState<IntroPhase>('initial')
	const isNavigating = useRouterState({
		select: (state) => state.status === 'pending',
	})

	useEffect(() => setIsMounted(true), [])

	useEffect(() => {
		return router.subscribe('onResolved', ({ hrefChanged }) => {
			if (hrefChanged) setInputValue('')
		})
	}, [router])

	const handlePhaseChange = useCallback((phase: IntroPhase) => {
		setIntroPhase(phase)
	}, [])

	return (
		<div className="flex flex-1 size-full items-center justify-center text-[16px]">
			<div className="grid place-items-center relative grid-flow-row gap-5 select-none w-full pt-15 pb-10 z-1">
				<Intro onPhaseChange={handlePhaseChange} />
				<div
					className="px-4 w-full flex justify-center transition-all duration-500 ease-out relative z-20"
					style={{
						opacity: introPhase !== 'initial' ? 1 : 0,
						transform:
							introPhase !== 'initial' ? 'translateY(0)' : 'translateY(12px)',
					}}
				>
					<ExploreInput
						autoFocus={introPhase === 'done'}
						size="large"
						value={inputValue}
						onChange={setInputValue}
						disabled={isMounted && isNavigating}
						className={introPhase === 'search' ? 'border-accent/50' : undefined}
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
				<SpotlightLinks introPhase={introPhase} />
			</div>
		</div>
	)
}

function SpotlightLinks({ introPhase }: { introPhase: IntroPhase }) {
	const navigate = useNavigate()
	const [actionOpen, setActionOpen] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)
	const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Explore = random/specific views: Account, Receipt, Action, Contract
	// Discover = list views: Blocks, Tokens
	const isExplorePulse = introPhase === 'explore'
	const isDiscoverPulse = introPhase === 'discover'

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setActionOpen(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	const handleMouseEnter = () => {
		if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
		setActionOpen(true)
	}

	const handleMouseLeave = () => {
		hoverTimeoutRef.current = setTimeout(() => setActionOpen(false), 150)
	}

	// Real transactions from Tempo testnet
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

	const showExplore = ['explore', 'discover', 'done'].includes(introPhase)
	const showDiscover = ['discover', 'done'].includes(introPhase)

	return (
		<section className="text-center max-w-[500px] px-4">
			<div className="group/pills flex items-center gap-2 text-[13px] flex-wrap justify-center">
				{/* Explore pills - animate in with "Explore" */}
				<div
					className="contents transition-all duration-300 ease-out"
					style={{
						opacity: showExplore ? 1 : 0,
					}}
				>
					<SpotlightPill
						className={cx({ hidden: !isTestnet })}
						to="/address/$address"
						params={{ address: '0x5bc1473610754a5ca10749552b119df90c1a1877' }}
						icon={<UserIcon className="size-[14px] text-accent" />}
						badge={<ShuffleIcon className="size-[10px] text-secondary" />}
						pulse={isExplorePulse}
						visible={showExplore}
					>
						Account
					</SpotlightPill>
					<SpotlightPill
						className={cx({ hidden: !isTestnet })}
						to="/address/$address"
						params={{ address: '0xe4b10A2a727D0f4863CEBca743a8dAb84cf65b2d' }}
						search={{ tab: 'contract' }}
						icon={<FileIcon className="size-[14px] text-accent" />}
						badge={<ShuffleIcon className="size-[10px] text-secondary" />}
						pulse={isExplorePulse}
						visible={showExplore}
						delay={50}
					>
						Contract
					</SpotlightPill>
					<SpotlightPill
						className={cx({ hidden: !isTestnet })}
						to="/receipt/$hash"
						params={{
							hash: '0x6d6d8c102064e6dee44abad2024a8b1d37959230baab80e70efbf9b0c739c4fd',
						}}
						icon={<ReceiptIcon className="size-[14px] text-accent" />}
						pulse={isExplorePulse}
						visible={showExplore}
						delay={100}
					>
						Receipt
					</SpotlightPill>
					{/** biome-ignore lint/a11y/noStaticElementInteractions: _ */}
					<div
						className={cx(
							'relative group-hover/pills:opacity-40 hover:opacity-100! transition-all duration-500 ease-out',
							{ hidden: !isTestnet },
						)}
						ref={dropdownRef}
						onMouseEnter={handleMouseEnter}
						onMouseLeave={handleMouseLeave}
						style={{
							opacity: showExplore ? 1 : 0,
							transform: showExplore ? 'translateY(0)' : 'translateY(12px)',
							transitionDelay: '150ms',
							zIndex: actionOpen ? 100 : 'auto',
						}}
					>
						<button
							type="button"
							onClick={() => setActionOpen(!actionOpen)}
							className="flex items-center gap-1.5 text-base-content-secondary hover:text-base-content border border-base-border hover:border-accent focus:border-accent px-2.5 py-1 rounded-full transition-all press-down bg-surface"
							style={
								isExplorePulse
									? { borderColor: 'rgba(59, 130, 246, 0.5)' }
									: undefined
							}
						>
							<ZapIcon className="size-[14px] text-accent" />
							<span>Action</span>
							<ChevronDownIcon
								className={`size-[12px] transition-transform ${
									actionOpen ? 'rotate-180' : ''
								}`}
							/>
						</button>
						{actionOpen && (
							<div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50">
								<div className="bg-base-plane rounded-full p-1 border border-base-border shadow-xl flex items-center gap-1 relative z-60">
									{actionTypes.map((action) => (
										<button
											key={action.label}
											type="button"
											onClick={() => {
												navigate({
													to: '/tx/$hash',
													params: { hash: action.hash },
												})
												setActionOpen(false)
											}}
											className="px-2.5 py-1 text-[12px] text-base-content-secondary hover:text-base-content hover:bg-base-border/40 rounded-full transition-colors whitespace-nowrap"
										>
											{action.label}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				</div>
				{/* Discover pills - animate in with "Discover" */}
				<SpotlightPill
					to="/blocks"
					icon={<BoxIcon className="size-[14px] text-accent" />}
					pulse={isDiscoverPulse}
					visible={showDiscover}
				>
					Blocks
				</SpotlightPill>
				<SpotlightPill
					className={cx({ hidden: !isTestnet })}
					to="/tokens"
					icon={<CoinsIcon className="size-[14px] text-accent" />}
					pulse={isDiscoverPulse}
					visible={showDiscover}
					delay={50}
				>
					Tokens
				</SpotlightPill>
			</div>
		</section>
	)
}

const PULSE_COLOR = 'rgba(59, 130, 246, 0.5)' // accent blue

function SpotlightPill(props: {
	className?: string
	to: string
	params?: Record<string, string>
	search?: Record<string, string>
	icon: React.ReactNode
	badge?: React.ReactNode
	pulse?: boolean
	visible?: boolean
	delay?: number
	children: React.ReactNode
}) {
	const {
		to,
		params,
		search,
		icon,
		badge,
		pulse,
		visible = true,
		delay = 0,
		children,
		className,
	} = props
	return (
		<Link
			to={to}
			{...(params ? { params } : {})}
			{...(search ? { search } : {})}
			className={cx(
				`relative flex items-center gap-1.5 text-base-content-secondary hover:text-base-content border hover:border-accent focus:border-accent py-1 rounded-full transition-all duration-500 ease-out press-down group-hover/pills:opacity-40 hover:opacity-100! bg-surface border-base-border`,
				badge ? 'pl-2.5 pr-4' : 'px-2.5',
				className,
			)}
			style={{
				...(pulse ? { borderColor: PULSE_COLOR } : {}),
				opacity: visible ? 1 : 0,
				transform: visible ? 'translateY(0)' : 'translateY(12px)',
				transitionDelay: `${delay}ms`,
			}}
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
