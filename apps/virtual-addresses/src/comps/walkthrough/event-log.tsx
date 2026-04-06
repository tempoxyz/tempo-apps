import type * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function EventLog(props: EventLog.Props): React.JSX.Element {
	const { entries } = props

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				maxHeight: 200,
				overflowY: 'auto',
			}}
		>
			<AnimatePresence mode="popLayout">
				{entries.map((entry, i) => (
					<motion.div
						key={entry.id ?? `${entry.type}-${i}`}
						data-guide-tx={entry.type}
						initial={{ opacity: 0, y: 8, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.25 }}
						style={{
							background: 'var(--color-surface-2)',
							border: '1px solid var(--color-border)',
							borderRadius: 8,
							padding: '8px 10px',
							fontSize: 11,
							fontFamily: 'var(--font-mono)',
						}}
					>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								gap: 8,
							}}
						>
							<span
								style={{
									color: typeColor(entry.type),
									fontWeight: 600,
									textTransform: 'uppercase',
									fontSize: 9,
									letterSpacing: '0.08em',
								}}
							>
								{entry.type}
							</span>
							{entry.txHash && (
								<span
									style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}
								>
									{entry.txHash.slice(0, 10)}…
								</span>
							)}
						</div>
						<div style={{ color: 'var(--color-text-secondary)', marginTop: 3 }}>
							{entry.message}
						</div>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	)
}

function typeColor(type: string): string {
	switch (type) {
		case 'register':
			return 'var(--color-accent)'
		case 'transfer':
			return 'var(--color-positive)'
		case 'balance':
			return 'var(--color-warning)'
		default:
			return 'var(--color-text-tertiary)'
	}
}

export declare namespace EventLog {
	type Entry = {
		id?: string
		type: 'register' | 'transfer' | 'balance'
		message: string
		txHash?: string
	}
	type Props = {
		entries: Entry[]
	}
}
