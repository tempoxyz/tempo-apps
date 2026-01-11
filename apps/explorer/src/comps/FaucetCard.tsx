import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Address, Hash } from 'viem'
import { isAddress } from 'viem'
import { useClient, useConnection } from 'wagmi'
import { ConnectWallet } from '#comps/ConnectWallet'
import { fundAddress } from '#lib/faucet'
import { FAUCET_TOKENS } from '#lib/constants'
import { cx } from '#cva.config'

export function FaucetCard() {
	const [activeTab, setActiveTab] = React.useState<'wallet' | 'address'>(
		'wallet',
	)

	return (
		<div className="bg-base-plane border border-base-border rounded-3xl overflow-hidden">
			<div className="p-8">
				<h1 className="text-[32px] font-semibold text-base-content mb-2">
					Faucet
				</h1>
				<p className="text-[15px] text-base-content-secondary mb-8">
					Get test stablecoins on Tempo testnet.
				</p>

				<div className="flex gap-4 mb-8 border-b border-base-border">
					<TabButton
						active={activeTab === 'wallet'}
						onClick={() => setActiveTab('wallet')}
					>
						Fund your wallet
					</TabButton>
					<TabButton
						active={activeTab === 'address'}
						onClick={() => setActiveTab('address')}
					>
						Fund an address
					</TabButton>
				</div>

				{activeTab === 'wallet' ? <FundWalletTab /> : <FundAddressTab />}

				<TokenList />
			</div>
		</div>
	)
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			className={cx(
				'text-[15px] pb-3 border-b-2 transition-colors',
				active
					? 'border-accent text-base-content'
					: 'border-transparent text-base-content-secondary hover:text-base-content',
			)}
			onClick={onClick}
		>
			{children}
		</button>
	)
}

function StepIndicator({
	step,
	completed,
}: {
	step: number
	completed: boolean
}) {
	return (
		<div
			className={cx(
				'w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium transition-all duration-300',
				completed
					? 'bg-green-100 text-green-600'
					: 'bg-base-background text-base-content-secondary border border-base-border',
			)}
		>
			{completed ? (
				<svg
					className="w-4 h-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
					role="img"
					aria-label="Completed"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M5 13l4 4L19 7"
					/>
				</svg>
			) : (
				step
			)}
		</div>
	)
}

function ViewReceiptLink({ txHashes }: { txHashes: Hash[] }) {
	const firstTx = txHashes[0]
	if (!firstTx) return null

	return (
		<Link
			to="/tx/$hash"
			params={{ hash: firstTx }}
			className="inline-flex items-center gap-1 text-[14px] text-accent hover:underline mt-2"
		>
			View receipt
			<svg
				className="w-3.5 h-3.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={2}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
				/>
			</svg>
		</Link>
	)
}

function FundWalletTab() {
	const { address } = useConnection()
	const client = useClient()
	const [lastTxHashes, setLastTxHashes] = React.useState<Hash[] | null>(null)

	const mutation = useMutation({
		mutationFn: async () => {
			if (!address || !client) throw new Error('Wallet not connected')
			return fundAddress(client, address)
		},
		onSuccess: (data) => {
			setLastTxHashes(data)
		},
	})

	const hasSucceeded = lastTxHashes !== null

	return (
		<div className="space-y-6">
			<div className="flex items-start gap-4">
				<div className="flex flex-col items-center">
					<StepIndicator
						step={1}
						completed={hasSucceeded && !mutation.isPending}
					/>
					<div
						className={cx(
							'w-px h-full min-h-[40px] mt-2 transition-colors duration-300',
							hasSucceeded ? 'bg-green-200' : 'bg-base-border',
						)}
					/>
				</div>
				<div className="flex-1 pb-4">
					<div className="flex items-center justify-between mb-3">
						<p className="text-[14px] text-base-content">
							{hasSucceeded
								? 'Wallet funded successfully.'
								: 'Connect your wallet to receive test stablecoins.'}
						</p>
						{hasSucceeded && (
							<FundButton
								disabled={mutation.isPending}
								onClick={() => mutation.mutate()}
								loading={mutation.isPending}
								isReset
							/>
						)}
					</div>
					<ConnectWallet />
					{hasSucceeded && <ViewReceiptLink txHashes={lastTxHashes} />}
				</div>
			</div>

			{address && !hasSucceeded && (
				<div className="flex items-start gap-4">
					<div className="flex flex-col items-center">
						<StepIndicator step={2} completed={false} />
					</div>
					<div className="flex-1">
						<p className="text-[14px] text-base-content-secondary mb-3">
							Request funds
						</p>
						<FundButton
							disabled={mutation.isPending}
							onClick={() => mutation.mutate()}
							loading={mutation.isPending}
							isReset={false}
						/>
					</div>
				</div>
			)}

			{mutation.isError && <ErrorMessage error={mutation.error} />}
		</div>
	)
}

function FundAddressTab() {
	const addressInputId = React.useId()
	const [inputAddress, setInputAddress] = React.useState('')
	const [lastTxHashes, setLastTxHashes] = React.useState<Hash[] | null>(null)
	const client = useClient()
	const isValid = inputAddress && isAddress(inputAddress)

	const mutation = useMutation({
		mutationFn: async () => {
			if (!isValid || !client) throw new Error('Invalid address')
			return fundAddress(client, inputAddress as Address)
		},
		onSuccess: (data) => {
			setLastTxHashes(data)
		},
	})

	const hasSucceeded = lastTxHashes !== null

	return (
		<div className="space-y-6">
			<div className="flex items-start gap-4">
				<div className="flex flex-col items-center">
					<StepIndicator
						step={1}
						completed={hasSucceeded && !mutation.isPending}
					/>
				</div>
				<div className="flex-1">
					<div className="flex items-center justify-between mb-3">
						<p className="text-[14px] text-base-content">
							{hasSucceeded
								? 'Add testnet funds to an address.'
								: 'Enter address to fund'}
						</p>
						{hasSucceeded && (
							<FundButton
								disabled={mutation.isPending}
								onClick={() => mutation.mutate()}
								loading={mutation.isPending}
								isReset
							/>
						)}
					</div>
					<div>
						<label
							htmlFor={addressInputId}
							className="text-[13px] text-base-content-secondary mb-2 block"
						>
							Address to fund
						</label>
						<input
							id={addressInputId}
							type="text"
							className="w-full px-4 py-3 bg-base-background border border-base-border rounded-xl text-[14px] text-base-content placeholder:text-base-content-secondary focus:outline-none focus:ring-2 focus:ring-accent"
							placeholder="0x..."
							value={inputAddress}
							onChange={(e) => setInputAddress(e.target.value)}
							disabled={mutation.isPending}
						/>
					</div>
					{hasSucceeded && <ViewReceiptLink txHashes={lastTxHashes} />}
					{!hasSucceeded && (
						<div className="mt-4">
							<FundButton
								disabled={!isValid || mutation.isPending}
								onClick={() => mutation.mutate()}
								loading={mutation.isPending}
								isReset={false}
							/>
						</div>
					)}
				</div>
			</div>

			{mutation.isError && <ErrorMessage error={mutation.error} />}
		</div>
	)
}

function FundButton({
	disabled,
	onClick,
	loading,
	isReset,
}: {
	disabled: boolean
	onClick: () => void
	loading: boolean
	isReset: boolean
}) {
	const buttonText = loading
		? 'Adding funds...'
		: isReset
			? 'Add more funds'
			: 'Add funds'

	return (
		<div>
			<button
				type="button"
				className={cx(
					'h-[32px] px-[14px] border border-dashed rounded-md text-[14px] tracking-tighter font-normal transition-colors',
					loading
						? 'bg-base-content text-base-plane border-base-content'
						: 'border-base-border text-base-content bg-transparent hover:bg-base-background active:bg-base-content active:text-base-plane active:border-base-content disabled:opacity-50 disabled:cursor-not-allowed',
				)}
				disabled={disabled}
				onClick={onClick}
			>
				{buttonText}
			</button>
			{!isReset && (
				<p className="text-[12px] text-base-content-secondary mt-2">
					Maximum of 2 requests every 8 hours
				</p>
			)}
		</div>
	)
}

function ErrorMessage({ error }: { error: Error | null }) {
	if (!error) return null

	return (
		<div className="p-4 bg-base-background rounded-xl">
			<p className="text-[13px] text-base-content-negative">
				Error: {error.message}
			</p>
		</div>
	)
}

function TokenList() {
	return (
		<div className="mt-8 pt-8 border-t border-base-border">
			<p className="text-[13px] text-base-content-secondary mb-4">
				The faucet funds the following assets.
			</p>
			<div className="space-y-2">
				{FAUCET_TOKENS.map((token) => (
					<div
						key={token.address}
						className="flex items-center justify-between text-[13px]"
					>
						<div className="flex items-center gap-2">
							<span className="text-base-content font-medium">
								{token.name}
							</span>
							<span className="text-base-content-secondary font-mono">
								{token.address}
							</span>
						</div>
						<span className="text-base-content-secondary">{token.amount}</span>
					</div>
				))}
			</div>
		</div>
	)
}
