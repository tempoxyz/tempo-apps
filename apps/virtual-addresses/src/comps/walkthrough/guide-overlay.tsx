import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWalkthroughStore } from '#store/walkthrough-store'

const STORAGE_KEY = 'virtual-addresses-guide-seen'

type GuideStep = {
	target: string
	additionalTargets?: string[]
	title: string
	body: string
	tooltip: 'right' | 'left' | 'below'
}

const INTRO_STEPS: GuideStep[] = [
	{
		target: '[data-guide="exchange"]',
		title: 'Exchange — Master Registration',
		body: 'The exchange registers as a virtual-address master on-chain. It mines a salt, calls the registry precompile, and receives a 4-byte masterId.',
		tooltip: 'right',
	},
	{
		target: '[data-guide="protocol"]',
		title: 'TIP-1022 Protocol Layer',
		body: 'The Virtual Registry maps masterId → master address. The TIP-20 precompile detects virtual addresses and auto-forwards tokens to the registered master.',
		tooltip: 'right',
	},
	{
		target: '[data-guide="sender"]',
		title: 'Sender',
		body: "A sender sends PathUSD to a virtual address. They don't need to know it's virtual — it looks like any other address.",
		tooltip: 'left',
	},
	{
		target: '[data-guide="start-demo"]',
		title: 'Ready to Go',
		body: 'Click Start Demo to run the full flow with real on-chain transactions on Tempo Moderato testnet.',
		tooltip: 'below',
	},
]

const POST_DEMO_STEPS: GuideStep[] = [
	{
		target: '[data-guide-section="registration"]',
		title: '1. Register Virtual Master',
		body: 'The exchange calls registerVirtualMaster(salt) on the registry precompile. The salt is a 32-byte value whose keccak256 hash (with the address) has 4 leading zero bytes.',
		tooltip: 'right',
	},
	{
		target: '[data-guide-section="registration"]',
		title: '2. Receive masterId',
		body: 'The registry returns a 4-byte masterId derived from bytes 4-8 of the hash. This ID uniquely identifies the exchange as a virtual-address master.',
		tooltip: 'right',
	},
	{
		target: '[data-guide-section="virtual-address"]',
		title: '3. Derive Virtual Address',
		body: 'Virtual addresses are derived offline: [masterId][FDFDFDFDFDFDFDFDFDFD magic][userTag]. No on-chain transaction needed — generate unlimited deposit addresses instantly.',
		tooltip: 'left',
	},
	{
		target: '[data-guide-section="transfer"]',
		title: '4. Send to Virtual Address',
		body: "The sender calls transfer(virtualAddress, amount) on the TIP-20 token — a standard ERC-20 transfer. The sender doesn't need to know the address is virtual.",
		tooltip: 'left',
	},
	{
		target: '[data-guide-section="precompile"]',
		title: '5. Magic Bytes Detected',
		body: 'The TIP-20 precompile checks bytes 4-14 of the recipient. If they match the FDFD…FD magic pattern, it identifies the address as virtual.',
		tooltip: 'right',
	},
	{
		target: '[data-guide-section="precompile"]',
		title: '6. Resolve masterId',
		body: 'The precompile extracts the 4-byte masterId from the virtual address and looks up the registered master address in the registry.',
		tooltip: 'right',
	},
	{
		target: '[data-guide-section="precompile"]',
		title: '7. Forward to Master',
		body: 'Tokens are credited directly to the master address. The virtual address balance stays at 0 — no sweep transaction needed.',
		tooltip: 'right',
	},
	{
		target: '[data-guide-section="balance"]',
		title: '8. Two Transfer Events',
		body: 'Two Transfer events are emitted: Transfer(sender → virtual) and Transfer(virtual → master). This preserves the audit trail while the master receives the funds.',
		tooltip: 'right',
		additionalTargets: ['[data-guide-section="precompile"]'],
	},
]

type GuideMode = 'intro' | 'post-demo' | null

type TargetRect = {
	top: number
	left: number
	width: number
	height: number
}

export function GuideOverlay(): React.JSX.Element | null {
	const demoState = useWalkthroughStore((s) => s.demoState)
	const prevDemoState = React.useRef(demoState)
	const [mode, setMode] = React.useState<GuideMode>(null)
	const [stepIndex, setStepIndex] = React.useState(0)
	const [targetRect, setTargetRect] = React.useState<TargetRect | null>(null)
	const rafRef = React.useRef(0)

	// Show intro on first visit
	React.useEffect(() => {
		const seen = localStorage.getItem(STORAGE_KEY)
		if (!seen) {
			setMode('intro')
			setStepIndex(0)
		}
	}, [])

	// Post-demo trigger when settlement completes
	React.useEffect(() => {
		if (prevDemoState.current !== 'complete' && demoState === 'complete') {
			setTimeout(() => {
				setMode('post-demo')
				setStepIndex(0)
			}, 1500)
		}
		prevDemoState.current = demoState
	}, [demoState])

	const steps =
		mode === 'intro' ? INTRO_STEPS : mode === 'post-demo' ? POST_DEMO_STEPS : []
	const step = steps[stepIndex] ?? null

	// Measure target element
	const measureTarget = React.useCallback(() => {
		if (!step) {
			setTargetRect(null)
			return
		}
		const el = document.querySelector(step.target)
		if (!el) {
			setTargetRect(null)
			return
		}

		const rect = el.getBoundingClientRect()
		let combined = {
			top: rect.top,
			left: rect.left,
			right: rect.right,
			bottom: rect.bottom,
		}

		if (step.additionalTargets) {
			for (const selector of step.additionalTargets) {
				const el2 = document.querySelector(selector)
				if (el2) {
					const rect2 = el2.getBoundingClientRect()
					combined = {
						top: Math.min(combined.top, rect2.top),
						left: Math.min(combined.left, rect2.left),
						right: Math.max(combined.right, rect2.right),
						bottom: Math.max(combined.bottom, rect2.bottom),
					}
				}
			}
		}

		setTargetRect({
			top: combined.top,
			left: combined.left,
			width: combined.right - combined.left,
			height: combined.bottom - combined.top,
		})
	}, [step])

	React.useEffect(() => {
		measureTarget()

		const handleResize = () => {
			cancelAnimationFrame(rafRef.current)
			rafRef.current = requestAnimationFrame(measureTarget)
		}

		window.addEventListener('resize', handleResize)
		window.addEventListener('scroll', handleResize, true)
		const interval = setInterval(measureTarget, 500)

		return () => {
			window.removeEventListener('resize', handleResize)
			window.removeEventListener('scroll', handleResize, true)
			clearInterval(interval)
			cancelAnimationFrame(rafRef.current)
		}
	}, [measureTarget])

	const advance = React.useCallback(() => {
		if (stepIndex < steps.length - 1) {
			setStepIndex(stepIndex + 1)
		} else {
			setMode(null)
			setStepIndex(0)
			if (mode === 'intro') {
				localStorage.setItem(STORAGE_KEY, 'true')
			}
		}
	}, [stepIndex, steps.length, mode])

	const skip = React.useCallback(() => {
		setMode(null)
		setStepIndex(0)
		if (mode === 'intro') {
			localStorage.setItem(STORAGE_KEY, 'true')
		}
	}, [mode])

	if (!mode || !step) return null

	const pad = 8
	const vh = window.innerHeight
	const vw = window.innerWidth

	const spot = targetRect
		? {
				top: targetRect.top - pad,
				left: targetRect.left - pad,
				width: targetRect.width + pad * 2,
				height: targetRect.height + pad * 2,
			}
		: null

	const tooltipWidth = 320
	const tooltipHeight = 200
	const tooltipPos: React.CSSProperties = {}
	if (spot) {
		if (step.tooltip === 'right') {
			tooltipPos.left = spot.left + spot.width + 16
			const centerY = spot.top + spot.height / 2 - tooltipHeight / 2
			tooltipPos.top = Math.max(16, Math.min(centerY, vh - tooltipHeight - 16))
		} else if (step.tooltip === 'left') {
			tooltipPos.left = spot.left - tooltipWidth - 16
			const centerY = spot.top + spot.height / 2 - tooltipHeight / 2
			tooltipPos.top = Math.max(16, Math.min(centerY, vh - tooltipHeight - 16))
		} else {
			const spaceBelow = vh - (spot.top + spot.height)
			if (spaceBelow > tooltipHeight) {
				tooltipPos.top = spot.top + spot.height + 12
			} else {
				tooltipPos.top = spot.top - tooltipHeight - 12
			}
			tooltipPos.left = Math.max(
				16,
				Math.min(spot.left, vw - tooltipWidth - 16),
			)
		}
	} else {
		tooltipPos.top = '50%'
		tooltipPos.left = '50%'
		tooltipPos.transform = 'translate(-50%, -50%)'
	}

	const isLast = stepIndex === steps.length - 1
	const isPostDemo = mode === 'post-demo'

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={`${mode}-${stepIndex}`}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.25 }}
				style={{
					position: 'fixed',
					inset: 0,
					zIndex: 9999,
					pointerEvents: 'none',
				}}
			>
				{/* Click-catcher — catches all clicks, advances step */}
				<button
					type="button"
					onClick={advance}
					style={{
						position: 'fixed',
						inset: 0,
						zIndex: 9999,
						cursor: 'pointer',
						pointerEvents: 'auto',
						background: 'transparent',
						border: 'none',
						padding: 0,
						margin: 0,
						width: '100%',
						height: '100%',
					}}
					aria-label="Advance guide"
				/>

				{/* Spotlight */}
				{spot ? (
					<div
						style={{
							position: 'fixed',
							top: spot.top,
							left: spot.left,
							width: spot.width,
							height: spot.height,
							borderRadius: 8,
							border: '1px solid rgba(255, 255, 255, 0.15)',
							boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
							zIndex: 10000,
							pointerEvents: 'none',
							transition: 'all 0.3s ease',
						}}
					/>
				) : (
					<div
						style={{
							position: 'fixed',
							inset: 0,
							background: 'rgba(0, 0, 0, 0.8)',
							zIndex: 10000,
							pointerEvents: 'none',
						}}
					/>
				)}

				{/* Tooltip */}
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.2, delay: 0.1 }}
					style={{
						position: 'fixed',
						...tooltipPos,
						width: tooltipWidth,
						background: 'var(--color-surface)',
						border: '1px solid var(--color-border-active)',
						borderRadius: 8,
						padding: '16px 20px',
						display: 'flex',
						flexDirection: 'column',
						gap: 10,
						zIndex: 10001,
						pointerEvents: 'auto',
					}}
				>
					<span
						style={{
							fontSize: 10,
							letterSpacing: '0.05em',
							textTransform: 'uppercase',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{isPostDemo ? 'How it works' : 'Tour'} — {stepIndex + 1} /{' '}
						{steps.length}
					</span>

					<span
						style={{
							fontSize: 14,
							fontWeight: 600,
							color: 'var(--color-text-primary)',
						}}
					>
						{step.title}
					</span>

					<span
						style={{
							fontSize: 12,
							lineHeight: 1.5,
							color: 'var(--color-text-secondary)',
						}}
					>
						{step.body}
					</span>

					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							marginTop: 4,
						}}
					>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation()
								skip()
							}}
							style={{
								height: 28,
								padding: '0 10px',
								border: 'none',
								background: 'transparent',
								color: 'var(--color-text-tertiary)',
								fontSize: 11,
								letterSpacing: '0.03em',
								cursor: 'pointer',
								fontFamily: 'inherit',
							}}
						>
							{isPostDemo ? 'Close' : 'Skip'}
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation()
								advance()
							}}
							style={{
								height: 28,
								padding: '0 16px',
								border: isLast
									? 'none'
									: '1px solid var(--color-border-active)',
								borderRadius: 6,
								background: isLast ? 'var(--color-accent)' : 'transparent',
								color: isLast ? '#000' : 'var(--color-text-primary)',
								fontSize: 11,
								letterSpacing: '0.03em',
								textTransform: 'uppercase',
								cursor: 'pointer',
								fontFamily: 'inherit',
								fontWeight: 600,
							}}
						>
							{isLast ? (isPostDemo ? 'Done' : 'Start Demo') : 'Next'}
						</button>
					</div>
				</motion.div>
			</motion.div>
		</AnimatePresence>
	)
}
