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
				<div className="grid place-items-center relative grid-flow-row gap-2 select-none w-full max-w-sm py-5 z-1">
					<h1 className="text-[24px] font-semibold text-primary tracking-tight text-center">
						Tempo account
					</h1>
					<form onSubmit={handleSubmit} className="w-full relative">
						<input
							ref={inputRef}
							type="text"
							name="value"
							value={address}
							onChange={(e) => setAddress(e.target.value)}
							placeholder="Enter a tempo address…"
							className="bg-surface border-base-border border pl-[16px] pr-[60px] w-full placeholder:text-tertiary text-base-content rounded-[10px] focus-visible:border-focus outline-0 h-[52px] text-[17px]"
							spellCheck={false}
							autoComplete="off"
							autoCapitalize="none"
							autoCorrect="off"
							data-1p-ignore
						/>
						<div className="absolute top-[50%] -translate-y-[50%] right-[16px]">
							<button
								type="submit"
								disabled={!isValidAddress}
								aria-label="Search"
								className={cx(
									'rounded-full! flex items-center justify-center active:translate-y-[0.5px] disabled:cursor-not-allowed size-[28px]',
									isValidAddress
										? 'bg-accent text-base-plane cursor-pointer'
										: 'bg-base-alt text-tertiary cursor-default',
								)}
							>
								<ArrowRight className="size-[16px]" />
							</button>
						</div>
					</form>
					<div className="flex items-center gap-1 text-[13px] flex-wrap justify-center">
						{getExampleAccounts().map((addr) => (
							<Link
								key={addr}
								to="/$address"
								params={{ address: addr }}
								className={cx(
									'flex items-center gap-0.75 text-base-content-secondary hover:text-base-content',
									'border border-base-border hover:border-accent focus-visible:border-accent',
									'px-1.25 py-0.5 rounded-full! press-down bg-surface focus-visible:outline-none',
									'focus-visible:duration-0 font-mono',
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
