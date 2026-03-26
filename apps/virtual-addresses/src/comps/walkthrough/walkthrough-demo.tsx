import type * as React from 'react'
import { cx } from '#lib/css'
import { useWalkthroughStore } from '#store/walkthrough-store'
import { ExchangePanel } from './exchange-panel'
import { ProtocolPanel } from './protocol-panel'
import { SenderPanel } from './sender-panel'
import { GuideOverlay } from './guide-overlay'

const SPEEDS = [0.1, 0.5, 1, 2] as const

export function WalkthroughDemo(): React.JSX.Element {
	const speed = useWalkthroughStore((s) => s.speed)
	const demoState = useWalkthroughStore((s) => s.demoState)
	const setSpeed = useWalkthroughStore((s) => s.setSpeed)
	const startDemo = useWalkthroughStore((s) => s.startDemo)
	const reset = useWalkthroughStore((s) => s.reset)

	const isRunning = demoState !== 'idle' && demoState !== 'complete'

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: 'calc(100vh - 53px)',
			}}
		>
			{/* Control bar */}
			<div
				style={{
					padding: '10px 20px',
					borderBottom: '1px solid var(--color-border)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					background: 'var(--color-surface)',
				}}
			>
				{/* Speed selector */}
				<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
					<span className="text-label" style={{ marginRight: 4 }}>
						Speed
					</span>
					{SPEEDS.map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => setSpeed(s)}
							className={cx(
								'px-2.5 py-1 rounded text-xs font-mono transition-colors',
								speed === s
									? 'bg-accent text-black font-semibold'
									: 'bg-surface-2 text-text-tertiary hover:text-text-secondary',
							)}
						>
							{s}x
						</button>
					))}
				</div>

				{/* Actions */}
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<button
						type="button"
						data-guide="start-demo"
						disabled={isRunning}
						onClick={startDemo}
						className={cx(
							'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
							isRunning
								? 'bg-surface-2 text-text-tertiary cursor-not-allowed'
								: 'bg-accent text-black hover:bg-accent-hover',
						)}
					>
						{demoState === 'complete' ? 'Run Again' : 'Start Demo'}
					</button>
					<button
						type="button"
						onClick={reset}
						className="px-3 py-1.5 rounded-lg text-sm text-text-tertiary hover:text-text-secondary bg-surface-2 transition-colors"
					>
						Reset
					</button>
				</div>
			</div>

			{/* 3-column grid */}
			<div
				style={{
					flex: 1,
					display: 'grid',
					gridTemplateColumns: '1fr 1.4fr 1fr',
					minHeight: 0,
				}}
			>
				<ExchangePanel />
				<ProtocolPanel />
				<SenderPanel />
			</div>

			<GuideOverlay />
		</div>
	)
}
