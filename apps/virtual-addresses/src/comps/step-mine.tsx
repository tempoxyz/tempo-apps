import type * as React from 'react'
import { useAccount } from 'wagmi'
import { cx } from '#lib/css'
import type { MinerState } from '#lib/miner.pool'

export function StepMine(props: StepMine.Props): React.JSX.Element {
	const { minerState, onStart, onStop } = props
	const { address } = useAccount()

	const isMining = minerState.status === 'mining'
	const isFound = minerState.status === 'found'

	function formatNumber(n: number): string {
		if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
		return n.toString()
	}

	return (
		<div className="glass-card p-6 space-y-5">
			<div>
				<h2 className="text-base font-semibold mb-1">Mine Salt</h2>
				<p className="text-sm text-text-secondary">
					Find a valid salt for your address via 32-bit proof-of-work. This runs
					entirely in your browser using{' '}
					{typeof navigator !== 'undefined'
						? Math.max(1, Math.min(8, (navigator.hardwareConcurrency ?? 4) - 1))
						: '?'}{' '}
					Web Workers.
				</p>
			</div>

			{!address && (
				<div className="text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg px-4 py-3">
					Connect your wallet first. The salt is mined for your connected
					address.
				</div>
			)}

			{address && (
				<div>
					<div className="text-label mb-1.5">Master Address</div>
					<div className="font-mono text-sm text-text-secondary bg-surface-2 rounded-lg px-4 py-2.5 break-all">
						{address}
					</div>
				</div>
			)}

			{isMining && (
				<div className="grid grid-cols-2 gap-4">
					<div className="bg-surface-2 rounded-lg p-4">
						<div className="text-label mb-1">Hashes Tried</div>
						<div className="font-mono text-lg font-semibold">
							{formatNumber(minerState.totalAttempts)}
						</div>
					</div>
					<div className="bg-surface-2 rounded-lg p-4">
						<div className="text-label mb-1">Hash Rate</div>
						<div className="font-mono text-lg font-semibold">
							{formatNumber(minerState.hashesPerSecond)}/s
						</div>
					</div>
				</div>
			)}

			{isFound && (
				<div className="space-y-3 bg-positive/5 border border-positive/20 rounded-lg p-4">
					<div className="flex items-center gap-2 text-positive text-sm font-medium">
						<span>✓</span> Valid salt found
					</div>
					<div>
						<div className="text-label mb-1">Salt</div>
						<div className="font-mono text-xs text-text-secondary break-all">
							{minerState.salt}
						</div>
					</div>
					<div>
						<div className="text-label mb-1">Master ID</div>
						<div className="font-mono text-sm text-master-id">
							{minerState.masterId}
						</div>
					</div>
					<div>
						<div className="text-label mb-1">Attempts</div>
						<div className="font-mono text-sm text-text-secondary">
							{formatNumber(minerState.attempts)}
						</div>
					</div>
				</div>
			)}

			{minerState.status === 'error' && (
				<div className="text-sm text-negative bg-negative/10 border border-negative/20 rounded-lg px-4 py-3">
					{minerState.message}
				</div>
			)}

			<div className="flex gap-3">
				{!isMining && !isFound && (
					<button
						type="button"
						disabled={!address}
						onClick={() => address && onStart(address)}
						className={cx(
							'flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors',
							address
								? 'bg-accent text-black hover:bg-accent-hover'
								: 'bg-surface-2 text-text-tertiary cursor-not-allowed',
						)}
					>
						Start Mining
					</button>
				)}
				{isMining && (
					<button
						type="button"
						onClick={onStop}
						className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-surface-2 text-text-primary border border-border hover:border-border-active transition-colors"
					>
						Stop Mining
					</button>
				)}
			</div>

			{isMining && (
				<div className="flex items-center gap-2 text-xs text-text-tertiary">
					<div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-hash-spin" />
					Mining with {minerState.workerCount} workers… expect ~1-3 min on
					modern hardware
				</div>
			)}
		</div>
	)
}

export declare namespace StepMine {
	type Props = {
		minerState: MinerState
		onStart: (address: string) => void
		onStop: () => void
	}
}
