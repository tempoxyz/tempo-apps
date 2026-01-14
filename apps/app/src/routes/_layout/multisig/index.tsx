import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { Layout } from '#comps/Layout'
import { cx } from '#lib/css'
import ArrowRight from '~icons/lucide/arrow-right'
import ShieldIcon from '~icons/lucide/shield'
import UsersIcon from '~icons/lucide/users'

export const Route = createFileRoute('/_layout/multisig/')({
	component: MultisigLanding,
})

const EXAMPLE_MULTISIGS = [
	'0x018910dDe46CD95F87B955f807B903cF156E2EC2',
]

function truncateAddress(address: string) {
	return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function MultisigLanding() {
	const navigate = useNavigate()
	const [address, setAddress] = React.useState('')
	const inputRef = React.useRef<HTMLInputElement>(null)

	const isValidAddress = address.startsWith('0x') && address.length === 42

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (isValidAddress) {
			navigate({ to: '/multisig/$address', params: { address } })
		}
	}

	React.useEffect(() => {
		inputRef.current?.focus()
	}, [])

	return (
		<>
			<Layout.Header left="Multisig" right={null} />
			<div className="flex flex-1 flex-col items-center justify-center">
				<div className="grid place-items-center relative grid-flow-row gap-3 select-none w-full max-w-md px-4 py-6 z-1">
					<div className="flex items-center justify-center size-16 rounded-2xl glass-thin mb-2">
						<ShieldIcon className="size-8 text-accent" />
					</div>
					<h1 className="font-sans font-semibold text-[32px] sm:text-[36px] text-primary text-center -tracking-[0.03em]">
						Multisig
					</h1>
					<p className="text-secondary text-[14px] sm:text-[15px] text-center -mt-1 mb-2 max-w-[300px]">
						Manage multi-signature wallets with threshold confirmations
					</p>
					<form onSubmit={handleSubmit} className="w-full relative">
						<input
							ref={inputRef}
							type="text"
							name="value"
							value={address}
							onChange={(e) => setAddress(e.target.value)}
							placeholder="Enter multisig address"
							className="glass-input pl-4 pr-14 w-full placeholder:text-tertiary text-base-content rounded-2xl outline-0 h-[56px] text-[16px]"
							spellCheck={false}
							autoComplete="off"
							autoCapitalize="none"
							autoCorrect="off"
							data-1p-ignore
						/>
						<div className="absolute top-[50%] -translate-y-[50%] right-[14px]">
							<button
								type="submit"
								disabled={!isValidAddress}
								aria-label="Open multisig"
								className={cx(
									'rounded-full flex items-center justify-center active:translate-y-[0.5px] disabled:cursor-not-allowed size-[32px] transition-all',
									isValidAddress
										? 'glass-button-accent cursor-pointer'
										: 'bg-base-alt/50 text-tertiary cursor-default backdrop-blur-sm',
								)}
							>
								<ArrowRight className="size-[18px]" />
							</button>
						</div>
					</form>
					<div className="flex items-center gap-1 text-[11px] justify-center mt-1">
						{EXAMPLE_MULTISIGS.map((addr) => (
							<Link
								key={addr}
								to="/multisig/$address"
								params={{ address: addr }}
								className={cx(
									'flex items-center gap-0.5 text-tertiary hover:text-secondary',
									'px-1.5 py-0.5 rounded press-down focus-visible:outline-none',
									'transition-all font-mono text-[10px]',
								)}
							>
								<UsersIcon className="size-[10px] text-accent/70" />
								<span>{truncateAddress(addr)}</span>
							</Link>
						))}
					</div>
				</div>
			</div>
		</>
	)
}
