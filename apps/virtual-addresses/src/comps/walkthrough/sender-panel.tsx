import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWalkthroughStore } from '#store/walkthrough-store'
import { AddressAnatomy } from '#comps/address-anatomy'
import { StatusBadge } from './status-badge'
import { EventLog } from './event-log'
import type { EventLog as EventLogNs } from './event-log'

const activeSteps = new Set([
	'send-start',
	'send-tx',
	'derive-virtual',
	'derive-anatomy',
])

function stepMessage(step: string, txPending: boolean): string {
	switch (step) {
		case 'derive-virtual':
			return 'Deriving virtual address…'
		case 'derive-anatomy':
			return 'Address structure breakdown'
		case 'send-start':
			return 'Preparing transfer…'
		case 'send-tx':
			return txPending ? 'Transaction pending…' : 'Sending PathUSD…'
		default:
			return 'Idle'
	}
}

export function SenderPanel(): React.JSX.Element {
	const step = useWalkthroughStore((s) => s.step)
	const demoState = useWalkthroughStore((s) => s.demoState)
	const txPending = useWalkthroughStore((s) => s.txPending)
	const data = useWalkthroughStore((s) => s.data)

	const isActive = activeSteps.has(step)

	const logEntries = React.useMemo(() => {
		const entries: EventLogNs.Entry[] = []
		if (
			data.virtualAddress &&
			(step === 'derive-anatomy' ||
				step === 'send-start' ||
				step === 'send-tx' ||
				demoState === 'sending' ||
				demoState === 'resolving' ||
				demoState === 'complete')
		) {
			entries.push({
				id: 'derive',
				type: 'register',
				message: `Virtual: ${data.virtualAddress.slice(0, 14)}…`,
			})
		}
		if (data.transferTxHash) {
			entries.push({
				id: 'tx',
				type: 'transfer',
				message: `Sent 100 PathUSD to virtual`,
				txHash: data.transferTxHash,
			})
		}
		return entries
	}, [data.virtualAddress, data.transferTxHash, step, demoState])

	return (
		<motion.div
			data-guide="sender"
			animate={{
				borderColor: isActive
					? 'var(--color-border-active)'
					: 'var(--color-border)',
			}}
			transition={{ duration: 0.3 }}
			style={{
				height: '100%',
				borderLeft: '1px solid var(--color-border)',
				display: 'flex',
				flexDirection: 'column',
				background: 'var(--color-surface)',
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
				<span style={{ fontWeight: 600, fontSize: 14 }}>Sender</span>
				<StatusBadge state={demoState} />
			</div>

			<div
				style={{
					flex: 1,
					padding: 20,
					display: 'flex',
					flexDirection: 'column',
					gap: 16,
					overflowY: 'auto',
				}}
			>
				{/* Address */}
				<div
					style={{
						background: 'var(--color-surface-2)',
						border: '1px solid var(--color-border)',
						borderRadius: 10,
						padding: 12,
					}}
				>
					<div className="text-label" style={{ marginBottom: 6 }}>
						Sender Address
					</div>
					{data.senderAddress ? (
						<div className="font-mono text-xs text-text-secondary break-all leading-relaxed">
							{data.senderAddress}
						</div>
					) : (
						<div className="font-mono text-xs text-text-tertiary">—</div>
					)}
				</div>

				{/* Virtual address anatomy */}
				<AnimatePresence>
					{data.virtualAddress &&
						(step === 'derive-anatomy' ||
							step === 'send-start' ||
							step === 'send-tx' ||
							demoState === 'sending' ||
							demoState === 'resolving' ||
							demoState === 'complete') && (
							<motion.div
								data-guide-section="virtual-address"
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								style={{
									background: 'var(--color-surface-2)',
									border: '1px solid var(--color-border)',
									borderRadius: 10,
									padding: 16,
								}}
							>
								<div className="text-label" style={{ marginBottom: 10 }}>
									Virtual Address
								</div>
								<AddressAnatomy address={data.virtualAddress} />
							</motion.div>
						)}
				</AnimatePresence>

				{/* Transfer section */}
				<div
					data-guide-section="transfer"
					style={{
						background: 'var(--color-surface-2)',
						border: '1px solid var(--color-border)',
						borderRadius: 10,
						padding: 16,
					}}
				>
					<div className="text-label" style={{ marginBottom: 10 }}>
						Transfer
					</div>

					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						<div>
							<div
								style={{
									fontSize: 10,
									color: 'var(--color-text-tertiary)',
									marginBottom: 2,
								}}
							>
								PathUSD
							</div>
							<div className="font-mono text-sm text-text-secondary">
								{data.senderBalance}
							</div>
						</div>

						<AnimatePresence>
							{txPending && step === 'send-tx' && (
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="flex items-center gap-2 text-xs text-accent"
								>
									<span className="animate-hash-spin inline-block">⟳</span>
									Sending to virtual address…
								</motion.div>
							)}
						</AnimatePresence>

						{data.transferTxHash && (
							<div className="font-mono text-xs text-positive">
								✓ Transfer confirmed
							</div>
						)}
					</div>
				</div>

				{/* Status */}
				<div
					className="text-xs text-text-tertiary"
					style={{ marginTop: 'auto' }}
				>
					{stepMessage(step, txPending)}
				</div>

				{/* Event log */}
				{logEntries.length > 0 && <EventLog entries={logEntries} />}
			</div>
		</motion.div>
	)
}
