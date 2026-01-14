import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { Layout } from '#comps/Layout'
import { cx } from '#lib/css'
import ArrowRight from '~icons/lucide/arrow-right'
import UserIcon from '~icons/lucide/user'

const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV

const EXAMPLE_ACCOUNTS: Record<string, readonly string[]> = {
	presto: [
		'0x195d45da04bd0a8c35800ab322ff9b50ac43e31d',
		'0xe2172991faf09bb280cd138717652d8f71ae2fd6',
		'0xf9711617a58f50cae39b24e919955b70971b3ff2',
	],
	default: [
		'0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
		'0x849151d7D0bF1F34b70d5caD5149D28CC2308bf1',
		'0x50EC05ADe8280758E2077fcBC08D878D4aef79C3',
	],
}

function getExampleAccounts() {
	return EXAMPLE_ACCOUNTS[TEMPO_ENV] ?? EXAMPLE_ACCOUNTS.default
}

function truncateAddress(address: string) {
	return `${address.slice(0, 5)}…${address.slice(-3)}`
}

export const Route = createFileRoute('/_layout/')({
	component: Landing,
})

function Landing() {
	const navigate = useNavigate()
	const [address, setAddress] = React.useState('')
	const inputRef = React.useRef<HTMLInputElement>(null)

	const isValidAddress = address.startsWith('0x') && address.length === 42

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (isValidAddress) {
			navigate({ to: '/$address', params: { address } })
		}
	}

	React.useEffect(() => {
		inputRef.current?.focus()
	}, [])

	return (
		<>
			<Layout.Header left="Search" right={null} />
			<div className="flex flex-1 flex-col items-center justify-center">
				<div className="grid place-items-center relative grid-flow-row gap-3 select-none w-full max-w-md py-6 z-1">
					<h1 className="font-sans font-semibold text-[36px] text-primary text-center -tracking-[0.03em]">
						Get started
					</h1>
					<p className="text-secondary text-[15px] text-center -mt-1 mb-2 max-w-[280px]">
						Explore accounts, token balances, and transaction history on Tempo
					</p>
					<form onSubmit={handleSubmit} className="w-full relative">
						<input
							ref={inputRef}
							type="text"
							name="value"
							value={address}
							onChange={(e) => setAddress(e.target.value)}
							placeholder="Paste an address or try an example"
							className="bg-surface border-base-border border-2 pl-[18px] pr-[64px] w-full placeholder:text-tertiary text-base-content rounded-xl focus-visible:border-accent outline-0 h-[56px] text-[16px] transition-colors"
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
								aria-label="Search"
								className={cx(
									'rounded-full flex items-center justify-center active:translate-y-[0.5px] disabled:cursor-not-allowed size-[32px] transition-all',
									isValidAddress
										? 'bg-accent text-white cursor-pointer hover:scale-105'
										: 'bg-base-alt text-tertiary cursor-default',
								)}
							>
								<ArrowRight className="size-[18px]" />
							</button>
						</div>
					</form>
					<div className="flex items-center gap-1.5 text-[13px] flex-wrap justify-center mt-1">
						{getExampleAccounts().map((addr) => (
							<Link
								key={addr}
								to="/$address"
								params={{ address: addr }}
								className={cx(
									'flex items-center gap-1 text-secondary hover:text-primary',
									'border border-base-border hover:border-accent focus-visible:border-accent',
									'px-2 py-1 rounded-full press-down bg-surface focus-visible:outline-none',
									'transition-all font-mono text-[12px]',
								)}
							>
								<UserIcon className="size-[14px] text-accent" />
								<span>{truncateAddress(addr)}</span>
							</Link>
						))}
					</div>
				</div>
			</div>
		</>
	)
}
