import type * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWalkthroughStore } from '#store/walkthrough-store'
import { AddressAnatomy } from '#comps/address-anatomy'
import { formatAddress } from '#lib/virtual-address'
import { StatusBadge } from './status-badge'

const registrySteps = new Set([
	'register-start',
	'register-mining',
	'register-tx',
	'register-confirmed',
])
const precompileSteps = new Set([
	'send-tx',
	'resolve-detect',
	'resolve-lookup',
	'resolve-forward',
	'transfer-events',
])

function FlowDot(props: {
	active: boolean
	reverse?: boolean
}): React.JSX.Element {
	const { active, reverse } = props
	return (
		<div
			style={{
				position: 'relative',
				height: 2,
				background: 'var(--color-border)',
				borderRadius: 1,
				flex: 1,
				overflow: 'hidden',
			}}
		>
			{active && (
				<motion.div
					initial={{ left: reverse ? '100%' : '-8%' }}
					animate={{ left: reverse ? '-8%' : '100%' }}
					transition={{
						duration: 1.4,
						repeat: Number.POSITIVE_INFINITY,
						ease: 'linear',
					}}
					style={{
						position: 'absolute',
						top: -3,
						width: 8,
						height: 8,
						borderRadius: '50%',
						background: 'var(--color-accent)',
						boxShadow: '0 0 8px var(--color-accent)',
					}}
				/>
			)}
		</div>
	)
}

function registryMessage(step: string): string {
	switch (step) {
		case 'register-start':
			return 'Preparing registration…'
		case 'register-mining':
			return 'Mining salt — 32-bit PoW in progress…'
		case 'register-tx':
			return 'registerVirtualMaster(salt) — tx pending…'
		case 'register-confirmed':
			return 'MasterRegistered event emitted ✓'
		default:
			return ''
	}
}

function precompileMessage(step: string): string {
	switch (step) {
		case 'send-tx':
			return 'transfer() received for virtual address'
		case 'resolve-detect':
			return 'Magic bytes detected — virtual address!'
		case 'resolve-lookup':
			return 'Looking up masterId → master address'
		case 'resolve-forward':
			return 'Forwarding tokens to master'
		case 'transfer-events':
			return 'Two Transfer events emitted ✓'
		default:
			return ''
	}
}

export function ProtocolPanel(): React.JSX.Element {
	const step = useWalkthroughStore((s) => s.step)
	const demoState = useWalkthroughStore((s) => s.demoState)
	const data = useWalkthroughStore((s) => s.data)

	const registryActive = registrySteps.has(step)
	const precompileActive = precompileSteps.has(step)

	return (
		<div
			data-guide="protocol"
			style={{
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				background: 'var(--color-bg)',
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: '14px 20px',
					borderBottom: '1px solid var(--color-border)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<span style={{ fontWeight: 600, fontSize: 14 }}>TIP-1022 Protocol</span>
				<StatusBadge state={demoState} />
			</div>

			<div
				style={{
					flex: 1,
					padding: 20,
					display: 'flex',
					flexDirection: 'column',
					gap: 20,
					overflowY: 'auto',
				}}
			>
				{/* Virtual Registry box */}
				<motion.div
					data-guide-section="registry"
					animate={{
						borderColor: registryActive
							? 'var(--color-accent)'
							: 'var(--color-border)',
					}}
					transition={{ duration: 0.3 }}
					style={{
						background: 'var(--color-surface)',
						border: '1px solid var(--color-border)',
						borderRadius: 12,
						padding: 20,
					}}
				>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 14,
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								background: registryActive
									? 'var(--color-accent)'
									: 'var(--color-border)',
								boxShadow: registryActive
									? '0 0 8px var(--color-accent)'
									: 'none',
								transition: 'all 0.3s',
							}}
						/>
						<span style={{ fontWeight: 600, fontSize: 13 }}>
							Virtual Registry
						</span>
					</div>

					{/* Flow line */}
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 14,
						}}
					>
						<span
							className="text-label"
							style={{ fontSize: 10, whiteSpace: 'nowrap' }}
						>
							Exchange
						</span>
						<FlowDot active={registryActive} />
						<span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
							⇄
						</span>
						<FlowDot active={registryActive} reverse />
						<span
							className="text-label"
							style={{ fontSize: 10, whiteSpace: 'nowrap' }}
						>
							Registry
						</span>
					</div>

					{/* Active message */}
					<AnimatePresence mode="wait">
						{registryActive && (
							<motion.div
								key={step}
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -6 }}
								transition={{ duration: 0.2 }}
								style={{
									background: 'var(--color-surface-2)',
									borderRadius: 8,
									padding: '10px 12px',
									fontSize: 12,
									fontFamily: 'var(--font-mono)',
									color: 'var(--color-accent)',
								}}
							>
								{registryMessage(step)}
							</motion.div>
						)}
					</AnimatePresence>

					{/* Completed items */}
					{!registryActive && data.masterId && (
						<div
							style={{
								background: 'var(--color-surface-2)',
								borderRadius: 8,
								padding: '10px 12px',
								display: 'flex',
								flexDirection: 'column',
								gap: 6,
							}}
						>
							<div
								style={{
									fontSize: 11,
									fontFamily: 'var(--font-mono)',
									color: 'var(--color-positive)',
								}}
							>
								✓ Registered
							</div>
							<div
								style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}
							>
								<span className="text-master-id">{data.masterId}</span>
								{' → '}
								{data.exchangeAddress ? (
									<span className="text-text-secondary">
										{formatAddress(data.exchangeAddress)}
									</span>
								) : (
									'…'
								)}
							</div>
						</div>
					)}
				</motion.div>

				{/* TIP-20 Precompile box */}
				<motion.div
					data-guide-section="precompile"
					animate={{
						borderColor: precompileActive
							? 'var(--color-positive)'
							: 'var(--color-border)',
					}}
					transition={{ duration: 0.3 }}
					style={{
						background: 'var(--color-surface)',
						border: '1px solid var(--color-border)',
						borderRadius: 12,
						padding: 20,
					}}
				>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 14,
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								background: precompileActive
									? 'var(--color-positive)'
									: 'var(--color-border)',
								boxShadow: precompileActive
									? '0 0 8px var(--color-positive)'
									: 'none',
								transition: 'all 0.3s',
							}}
						/>
						<span style={{ fontWeight: 600, fontSize: 13 }}>
							TIP-20 Precompile
						</span>
					</div>

					{/* Flow line: Sender → Virtual → Master */}
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 14,
						}}
					>
						<span
							className="text-label"
							style={{ fontSize: 10, whiteSpace: 'nowrap' }}
						>
							Sender
						</span>
						<FlowDot active={precompileActive} />
						<span
							className="font-mono"
							style={{
								fontSize: 10,
								color: 'var(--color-virtual-magic)',
								whiteSpace: 'nowrap',
							}}
						>
							Virtual
						</span>
						<FlowDot active={precompileActive} />
						<span
							className="text-label"
							style={{ fontSize: 10, whiteSpace: 'nowrap' }}
						>
							Master
						</span>
					</div>

					{/* Active message */}
					<AnimatePresence mode="wait">
						{precompileActive && (
							<motion.div
								key={step}
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -6 }}
								transition={{ duration: 0.2 }}
								style={{
									background: 'var(--color-surface-2)',
									borderRadius: 8,
									padding: '10px 12px',
									fontSize: 12,
									fontFamily: 'var(--font-mono)',
									color: 'var(--color-positive)',
								}}
							>
								{precompileMessage(step)}
							</motion.div>
						)}
					</AnimatePresence>

					{/* Virtual address anatomy */}
					<AnimatePresence>
						{data.virtualAddress &&
							(step === 'resolve-detect' ||
								step === 'resolve-lookup' ||
								step === 'resolve-forward' ||
								step === 'transfer-events' ||
								step === 'balances-final' ||
								demoState === 'complete') && (
								<motion.div
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									style={{
										background: 'var(--color-surface-2)',
										borderRadius: 8,
										padding: '10px 12px',
										marginTop: 6,
									}}
								>
									<div
										style={{
											fontSize: 9,
											textTransform: 'uppercase',
											letterSpacing: '0.08em',
											color: 'var(--color-virtual-magic)',
											fontWeight: 600,
											marginBottom: 6,
										}}
									>
										Resolving
									</div>
									<AddressAnatomy address={data.virtualAddress} />
								</motion.div>
							)}
					</AnimatePresence>

					{/* Transfer events */}
					<AnimatePresence>
						{(step === 'transfer-events' ||
							step === 'balances-final' ||
							demoState === 'complete') &&
							data.transferEvents.map((evt, i) => (
								<motion.div
									key={evt.label}
									initial={{ opacity: 0, x: -8 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: i * 0.15 }}
									style={{
										background: 'var(--color-surface-2)',
										borderRadius: 8,
										padding: '8px 12px',
										fontSize: 11,
										fontFamily: 'var(--font-mono)',
										color: 'var(--color-text-secondary)',
										marginTop: 6,
									}}
								>
									<span
										style={{
											color: 'var(--color-positive)',
											fontWeight: 600,
											fontSize: 9,
											textTransform: 'uppercase',
											letterSpacing: '0.08em',
										}}
									>
										Transfer
									</span>
									<div style={{ marginTop: 4, fontSize: 10 }}>
										<span className="text-text-tertiary">
											{formatAddress(evt.from as `0x${string}`)}
										</span>
										{' → '}
										<span className="text-text-tertiary">
											{formatAddress(evt.to as `0x${string}`)}
										</span>
										<span className="text-text-secondary">
											{' '}
											{evt.amount} PathUSD
										</span>
									</div>
								</motion.div>
							))}
					</AnimatePresence>
				</motion.div>
			</div>
		</div>
	)
}
