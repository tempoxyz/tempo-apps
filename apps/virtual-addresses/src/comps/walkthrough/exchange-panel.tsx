import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import { useWalkthroughStore } from '#store/walkthrough-store'
import { StatusBadge } from './status-badge'
import { EventLog } from './event-log'
import type { EventLog as EventLogNs } from './event-log'

const activeSteps = new Set([
	'register-start',
	'register-mining',
	'register-tx',
	'register-confirmed',
	'balances-final',
])

function formatNumber(n: number): string {
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
	return n.toString()
}

function stepMessage(step: string, txPending: boolean): string {
	switch (step) {
		case 'register-start':
			return 'Preparing registration…'
		case 'register-mining':
			return 'Mining valid salt (32-bit PoW)…'
		case 'register-tx':
			return txPending ? 'Registering on-chain…' : 'Awaiting confirmation…'
		case 'register-confirmed':
			return 'Master registered ✓'
		case 'balances-final':
			return 'Balance updated'
		default:
			return 'Idle'
	}
}

export function ExchangePanel(): React.JSX.Element {
	const step = useWalkthroughStore((s) => s.step)
	const demoState = useWalkthroughStore((s) => s.demoState)
	const txPending = useWalkthroughStore((s) => s.txPending)
	const data = useWalkthroughStore((s) => s.data)

	const isActive = activeSteps.has(step)

	const logEntries = React.useMemo(() => {
		const entries: EventLogNs.Entry[] = []
		if (data.registerTxHash) {
			entries.push({
				id: 'reg',
				type: 'register',
				message: `registerVirtualMaster(${data.salt})`,
				txHash: data.registerTxHash,
			})
		}
		if (data.masterId) {
			entries.push({
				id: 'mid',
				type: 'register',
				message: `MasterRegistered → ${data.masterId}`,
			})
		}
		if (step === 'balances-final' || demoState === 'complete') {
			entries.push({
				id: 'bal',
				type: 'balance',
				message: `PathUSD balance: ${data.exchangeBalance}`,
			})
		}
		return entries
	}, [
		data.registerTxHash,
		data.salt,
		data.masterId,
		data.exchangeBalance,
		step,
		demoState,
	])

	return (
		<motion.div
			data-guide="exchange"
			animate={{
				borderColor: isActive
					? 'var(--color-border-active)'
					: 'var(--color-border)',
			}}
			transition={{ duration: 0.3 }}
			style={{
				height: '100%',
				borderRight: '1px solid var(--color-border)',
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
				<span style={{ fontWeight: 600, fontSize: 14 }}>Exchange</span>
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
						Master Address
					</div>
					{data.exchangeAddress ? (
						<a
							href={`https://explore.moderato.tempo.xyz/address/${data.exchangeAddress}`}
							target="_blank"
							rel="noopener noreferrer"
							className="font-mono text-xs text-accent hover:text-accent-hover break-all leading-relaxed"
						>
							{data.exchangeAddress}
						</a>
					) : (
						<div className="font-mono text-xs text-text-tertiary">—</div>
					)}
				</div>

				{/* Registration section */}
				<div
					data-guide-section="registration"
					style={{
						background: 'var(--color-surface-2)',
						border: '1px solid var(--color-border)',
						borderRadius: 10,
						padding: 16,
					}}
				>
					<div className="text-label" style={{ marginBottom: 10 }}>
						Registration
					</div>

					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{/* Salt */}
						<div>
							<div
								style={{
									fontSize: 10,
									color: 'var(--color-text-tertiary)',
									marginBottom: 2,
								}}
							>
								salt
							</div>
							<AnimatePresence mode="wait">
								{data.salt ? (
									<motion.div
										key="salt"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										className="font-mono text-xs text-text-secondary break-all"
									>
										{data.salt}
									</motion.div>
								) : (
									<div className="font-mono text-xs text-text-tertiary">—</div>
								)}
							</AnimatePresence>
						</div>

						{/* Master ID */}
						<div>
							<div
								style={{
									fontSize: 10,
									color: 'var(--color-text-tertiary)',
									marginBottom: 2,
								}}
							>
								masterId
							</div>
							<AnimatePresence mode="wait">
								{data.masterId ? (
									<motion.div
										key="mid"
										initial={{ opacity: 0, y: 4 }}
										animate={{ opacity: 1, y: 0 }}
										className="font-mono text-sm text-master-id"
									>
										{data.masterId}
									</motion.div>
								) : (
									<div className="font-mono text-xs text-text-tertiary">—</div>
								)}
							</AnimatePresence>
						</div>

						{/* Mining progress */}
						<AnimatePresence>
							{step === 'register-mining' && data.miningProgress && (
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									style={{
										display: 'flex',
										flexDirection: 'column',
										gap: 6,
										background: 'var(--color-surface-3)',
										borderRadius: 8,
										padding: '10px 12px',
									}}
								>
									<div className="flex items-center gap-2 text-xs text-accent">
										<span className="animate-hash-spin inline-block">⟳</span>
										Mining with {data.miningProgress.workerCount} workers…
									</div>
									<div className="flex gap-4 text-xs font-mono text-text-secondary">
										<span>
											{formatNumber(data.miningProgress.totalAttempts)} hashes
										</span>
										<span>
											{formatNumber(data.miningProgress.hashesPerSecond)}/s
										</span>
									</div>
								</motion.div>
							)}
						</AnimatePresence>

						{/* Tx status */}
						<AnimatePresence>
							{txPending && step === 'register-tx' && (
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="flex items-center gap-2 text-xs text-accent"
								>
									<span className="animate-hash-spin inline-block">⟳</span>
									Registering on-chain…
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>

				{/* Balance section */}
				<div
					data-guide-section="balance"
					style={{
						background: 'var(--color-surface-2)',
						border: '1px solid var(--color-border)',
						borderRadius: 10,
						padding: 16,
					}}
				>
					<div className="text-label" style={{ marginBottom: 10 }}>
						PathUSD Balance
					</div>
					<AnimatePresence mode="wait">
						<motion.div
							key={data.exchangeBalance}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							className="font-mono text-lg text-positive"
						>
							{data.exchangeBalance}
						</motion.div>
					</AnimatePresence>
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
