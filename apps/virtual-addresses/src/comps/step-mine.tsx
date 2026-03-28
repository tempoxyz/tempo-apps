import * as React from 'react'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { cx } from '#lib/css'
import { demoFund } from '#lib/demo-client'
import type { MinerState } from '#lib/miner.pool'

const ZERO_ADDR = `0x${'0'.repeat(40)}`

function isValidAddress(s: string): boolean {
	return /^0x[0-9a-fA-F]{40}$/.test(s) && s !== ZERO_ADDR
}

export function StepMine(props: StepMine.Props): React.JSX.Element {
	const { minerState, onStart, onStop } = props
	const { address: walletAddress } = useAccount()
	const [manualAddress, setManualAddress] = useState('')

	const [funding, setFunding] = useState(false)
	const [fundResult, setFundResult] = useState<string | null>(null)

	const isMining = minerState.status === 'mining'
	const isFound = minerState.status === 'found'

	const effectiveAddress =
		walletAddress ?? (isValidAddress(manualAddress) ? manualAddress : null)

	// Auto-fund when wallet connects
	React.useEffect(() => {
		if (!walletAddress) return
		let cancelled = false
		setFunding(true)
		demoFund(walletAddress as Address)
			.then((result) => {
				if (cancelled) return
				if (result.funded.length > 0) {
					setFundResult(
						`Funded ${result.funded.length} account(s) with 10,000 PathUSD`,
					)
				}
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setFunding(false)
			})
		return () => {
			cancelled = true
		}
	}, [walletAddress])

	async function handleFund() {
		if (!effectiveAddress) return
		setFunding(true)
		setFundResult(null)
		try {
			const result = await demoFund(effectiveAddress as Address)
			setFundResult(
				result.funded.length > 0
					? `Funded ${result.funded.length} account(s) with 10,000 PathUSD`
					: 'Accounts already funded',
			)
		} catch {
			setFundResult('Fund request failed — is the local node running?')
		}
		setFunding(false)
	}

	function formatNumber(n: number): string {
		if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
		return n.toString()
	}

	return (
		<div className="glass-card p-6 space-y-5">
			<div>
				<h2 className="text-base font-semibold mb-1">Mine Salt</h2>
				<p className="text-sm text-text-secondary">
					Find a valid salt for your address via 32-bit proof-of-work.
				</p>
			</div>

			{walletAddress ? (
				<div>
					<div className="text-label mb-1.5">Master Address (wallet)</div>
					<div className="font-mono text-sm text-text-secondary bg-surface-2 rounded-lg px-4 py-2.5 break-all">
						{walletAddress}
					</div>
				</div>
			) : (
				<div>
					<div className="text-label mb-1.5">Master Address</div>
					<input
						type="text"
						value={manualAddress}
						onChange={(e) => setManualAddress(e.target.value)}
						placeholder="0x… (connect wallet or paste address)"
						className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 font-mono text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
					/>
					{manualAddress && !isValidAddress(manualAddress) && (
						<div className="text-xs text-negative mt-1.5">
							Invalid address — must be 0x followed by 40 hex characters
						</div>
					)}
				</div>
			)}

			{effectiveAddress && !isMining && !isFound && (
				<button
					type="button"
					onClick={handleFund}
					disabled={funding}
					className="w-full py-2 rounded-lg text-sm text-text-secondary bg-surface-2 border border-border hover:border-border-active transition-colors disabled:opacity-50"
				>
					{funding ? 'Funding…' : 'Fund with PathUSD (localnet)'}
				</button>
			)}

			{fundResult && (
				<div className="text-xs text-text-secondary bg-surface-2 rounded-lg px-4 py-2.5">
					{fundResult}
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
						disabled={!effectiveAddress}
						onClick={() => effectiveAddress && onStart(effectiveAddress)}
						className={cx(
							'flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors',
							effectiveAddress
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
					Mining in-browser with {minerState.workerCount} Web Workers — expect
					~3 min on modern hardware
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
