import { useNavigate, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useAccount, useConnect, useConnectors, useDisconnect } from 'wagmi'
import { cx } from '#lib/css'

import SearchIcon from '~icons/lucide/search'
import KeyIcon from '~icons/lucide/key-round'
import FingerprintIcon from '~icons/lucide/fingerprint'
import LogOutIcon from '~icons/lucide/log-out'
import HomeIcon from '~icons/lucide/home'
import GlobeIcon from '~icons/lucide/globe'
import BookOpenIcon from '~icons/lucide/book-open'
import SendIcon from '~icons/lucide/send'
import WalletIcon from '~icons/lucide/wallet'
import RefreshCwIcon from '~icons/lucide/refresh-cw'
import ExternalLinkIcon from '~icons/lucide/external-link'
import CommandIcon from '~icons/lucide/command'
import ArrowRightIcon from '~icons/lucide/arrow-right'

type CommandItem = {
	id: string
	label: string
	description?: string
	icon: React.ReactNode
	shortcut?: string[]
	action: () => void
	keywords?: string[]
	group: 'navigation' | 'account' | 'actions' | 'links'
}

const CommandMenuContext = React.createContext<{
	open: boolean
	setOpen: React.Dispatch<React.SetStateAction<boolean>>
} | null>(null)

export function CommandMenuProvider({
	children,
}: {
	children: React.ReactNode
}) {
	const [open, setOpen] = React.useState(false)
	const [isMounted, setIsMounted] = React.useState(false)

	React.useEffect(() => {
		setIsMounted(true)
	}, [])

	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault()
				setOpen((prev) => !prev)
			}
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [])

	return (
		<CommandMenuContext.Provider value={{ open, setOpen }}>
			{children}
			{isMounted && <CommandTrigger onClick={() => setOpen(true)} />}
			{isMounted && open && <CommandMenu onClose={() => setOpen(false)} />}
		</CommandMenuContext.Provider>
	)
}

function CommandTrigger({ onClick }: { onClick: () => void }) {
	const isMac =
		typeof navigator !== 'undefined' &&
		navigator.platform?.toLowerCase().includes('mac')

	return createPortal(
		<button
			type="button"
			onClick={onClick}
			className={cx(
				'fixed bottom-4 right-4 z-50',
				'flex items-center gap-2 px-3 py-2 rounded-full',
				'glass-button hover:ring-glass',
				'text-[13px] text-secondary hover:text-primary',
				'cursor-pointer press-down transition-all',
				'shadow-lg shadow-black/10',
			)}
			title="Open command menu"
		>
			<CommandIcon className="size-[14px]" />
			<span className="hidden sm:inline">Command</span>
			<kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-white/10 rounded border border-white/10">
				{isMac ? '⌘' : 'Ctrl'}K
			</kbd>
		</button>,
		document.body,
	)
}

export function useCommandMenu() {
	const context = React.useContext(CommandMenuContext)
	if (!context) {
		throw new Error('useCommandMenu must be used within CommandMenuProvider')
	}
	return context
}

function CommandMenu({ onClose }: { onClose: () => void }) {
	const [query, setQuery] = React.useState('')
	const [selectedIndex, setSelectedIndex] = React.useState(0)
	const [isVisible, setIsVisible] = React.useState(false)
	const inputRef = React.useRef<HTMLInputElement>(null)
	const listRef = React.useRef<HTMLDivElement>(null)

	const navigate = useNavigate()
	const router = useRouter()
	const account = useAccount()
	const { disconnect } = useDisconnect()
	const { connect } = useConnect()
	const [connector] = useConnectors()

	const commands = React.useMemo<CommandItem[]>(() => {
		const items: CommandItem[] = []

		// Navigation
		items.push({
			id: 'home',
			label: 'Go Home',
			description: 'Return to the home page',
			icon: <HomeIcon className="size-[18px]" />,
			shortcut: ['G', 'H'],
			action: () => {
				navigate({ to: '/' })
				onClose()
			},
			keywords: ['home', 'start', 'landing', 'main'],
			group: 'navigation',
		})

		if (account.address) {
			const address = account.address
			items.push({
				id: 'my-account',
				label: 'My Account',
				description: `View your portfolio`,
				icon: <WalletIcon className="size-[18px]" />,
				shortcut: ['G', 'A'],
				action: () => {
					navigate({ to: '/$address', params: { address } })
					onClose()
				},
				keywords: ['account', 'portfolio', 'wallet', 'balance', 'my'],
				group: 'navigation',
			})
		}

		items.push({
			id: 'search-address',
			label: 'Search Address',
			description: 'Look up any wallet address',
			icon: <SearchIcon className="size-[18px]" />,
			shortcut: ['/'],
			action: () => {
				navigate({ to: '/' })
				onClose()
				setTimeout(() => {
					const input = document.querySelector(
						'input[name="value"]',
					) as HTMLInputElement
					input?.focus()
				}, 100)
			},
			keywords: ['search', 'find', 'lookup', 'address', 'wallet'],
			group: 'navigation',
		})

		// Account actions
		if (account.address) {
			const addr = account.address
			items.push({
				id: 'send-tokens',
				label: 'Send Tokens',
				description: 'Transfer tokens to another address',
				icon: <SendIcon className="size-[18px]" />,
				shortcut: ['S'],
				action: () => {
					navigate({ to: '/$address', params: { address: addr } })
					onClose()
				},
				keywords: ['send', 'transfer', 'pay', 'tokens'],
				group: 'actions',
			})

			items.push({
				id: 'refresh',
				label: 'Refresh Data',
				description: 'Reload your account data',
				icon: <RefreshCwIcon className="size-[18px]" />,
				shortcut: ['R'],
				action: () => {
					router.invalidate()
					onClose()
				},
				keywords: ['refresh', 'reload', 'update', 'sync'],
				group: 'actions',
			})

			items.push({
				id: 'sign-out',
				label: 'Sign Out',
				description: 'Disconnect your wallet',
				icon: <LogOutIcon className="size-[18px]" />,
				action: () => {
					disconnect()
					navigate({ to: '/' })
					onClose()
				},
				keywords: ['sign out', 'logout', 'disconnect', 'exit'],
				group: 'account',
			})
		} else {
			items.push({
				id: 'sign-up',
				label: 'Create Account',
				description: 'Sign up with a new passkey',
				icon: <KeyIcon className="size-[18px]" />,
				action: () => {
					if (connector) {
						connect({
							connector,
							capabilities: { type: 'sign-up' },
						} as Parameters<typeof connect>[0])
					}
					onClose()
				},
				keywords: ['sign up', 'register', 'create', 'new', 'passkey'],
				group: 'account',
			})

			items.push({
				id: 'sign-in',
				label: 'Sign In',
				description: 'Use an existing passkey',
				icon: <FingerprintIcon className="size-[18px]" />,
				action: () => {
					if (connector) {
						connect({ connector })
					}
					onClose()
				},
				keywords: ['sign in', 'login', 'connect', 'passkey'],
				group: 'account',
			})
		}

		// External links
		items.push({
			id: 'website',
			label: 'Tempo Website',
			description: 'Visit tempo.xyz',
			icon: <GlobeIcon className="size-[18px]" />,
			action: () => {
				window.open('https://tempo.xyz', '_blank')
				onClose()
			},
			keywords: ['website', 'tempo', 'home'],
			group: 'links',
		})

		items.push({
			id: 'docs',
			label: 'Documentation',
			description: 'Read the docs',
			icon: <BookOpenIcon className="size-[18px]" />,
			action: () => {
				window.open('https://docs.tempo.xyz', '_blank')
				onClose()
			},
			keywords: ['docs', 'documentation', 'help', 'guide', 'learn'],
			group: 'links',
		})

		if (account.address) {
			items.push({
				id: 'explorer',
				label: 'View on Explorer',
				description: 'See your account on the block explorer',
				icon: <ExternalLinkIcon className="size-[18px]" />,
				action: () => {
					window.open(
						`https://explore.mainnet.tempo.xyz/address/${account.address}`,
						'_blank',
					)
					onClose()
				},
				keywords: ['explorer', 'block', 'transactions', 'history'],
				group: 'links',
			})
		}

		return items
	}, [
		account.address,
		navigate,
		onClose,
		disconnect,
		connect,
		connector,
		router,
	])

	const filteredCommands = React.useMemo(() => {
		if (!query.trim()) return commands

		const lowerQuery = query.toLowerCase()
		return commands.filter((cmd) => {
			const matchLabel = cmd.label.toLowerCase().includes(lowerQuery)
			const matchDescription = cmd.description
				?.toLowerCase()
				.includes(lowerQuery)
			const matchKeywords = cmd.keywords?.some((kw) => kw.includes(lowerQuery))
			return matchLabel || matchDescription || matchKeywords
		})
	}, [commands, query])

	const groupedCommands = React.useMemo(() => {
		const groups: Record<string, CommandItem[]> = {
			navigation: [],
			actions: [],
			account: [],
			links: [],
		}
		for (const cmd of filteredCommands) {
			groups[cmd.group].push(cmd)
		}
		return groups
	}, [filteredCommands])

	const flatCommands = React.useMemo(() => {
		return [
			...groupedCommands.navigation,
			...groupedCommands.actions,
			...groupedCommands.account,
			...groupedCommands.links,
		]
	}, [groupedCommands])

	React.useEffect(() => {
		setSelectedIndex(0)
	}, [])

	React.useEffect(() => {
		requestAnimationFrame(() => setIsVisible(true))
		inputRef.current?.focus()
	}, [])

	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setIsVisible(false)
				setTimeout(onClose, 150)
			} else if (e.key === 'ArrowDown') {
				e.preventDefault()
				setSelectedIndex((i) => Math.min(i + 1, flatCommands.length - 1))
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				setSelectedIndex((i) => Math.max(i - 1, 0))
			} else if (e.key === 'Enter') {
				e.preventDefault()
				flatCommands[selectedIndex]?.action()
			}
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [flatCommands, selectedIndex, onClose])

	React.useEffect(() => {
		const selected = listRef.current?.querySelector('[data-selected="true"]')
		selected?.scrollIntoView({ block: 'nearest' })
	}, [])

	const handleClose = () => {
		setIsVisible(false)
		setTimeout(onClose, 150)
	}

	const groupLabels: Record<string, string> = {
		navigation: 'Navigation',
		actions: 'Actions',
		account: 'Account',
		links: 'Links',
	}

	let itemIndex = -1

	return createPortal(
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled in useEffect
		// biome-ignore lint/a11y/noStaticElementInteractions: Modal backdrop
		<div
			className={cx(
				'fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4',
				'bg-black/50 backdrop-blur-sm transition-opacity duration-150',
				isVisible ? 'opacity-100' : 'opacity-0',
			)}
			onClick={handleClose}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Modal content container */}
			<div
				className={cx(
					'w-full max-w-[560px] overflow-hidden rounded-2xl',
					'liquid-glass-premium border border-white/10',
					'shadow-2xl shadow-black/30',
					'transition-all duration-150',
					isVisible
						? 'opacity-100 scale-100 translate-y-0'
						: 'opacity-0 scale-95 -translate-y-4',
				)}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Search input */}
				<div className="flex items-center gap-3 px-4 h-[56px] border-b border-white/10">
					<SearchIcon className="size-[18px] text-secondary shrink-0" />
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search commands..."
						className="flex-1 bg-transparent text-[15px] text-primary placeholder:text-tertiary outline-none"
						autoComplete="off"
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
					/>
					<kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-[11px] text-tertiary bg-white/5 rounded-md border border-white/10">
						<span>esc</span>
					</kbd>
				</div>

				{/* Results */}
				<div
					ref={listRef}
					className="max-h-[400px] overflow-y-auto overflow-x-hidden py-2"
				>
					{flatCommands.length === 0 ? (
						<div className="px-4 py-8 text-center">
							<p className="text-[14px] text-tertiary">No results found</p>
							<p className="text-[12px] text-tertiary/60 mt-1">
								Try a different search term
							</p>
						</div>
					) : (
						Object.entries(groupedCommands).map(([group, items]) => {
							if (items.length === 0) return null
							return (
								<div key={group} className="mb-2 last:mb-0">
									<div className="px-4 py-1.5">
										<span className="text-[11px] font-medium text-tertiary uppercase tracking-wider">
											{groupLabels[group]}
										</span>
									</div>
									{items.map((cmd) => {
										itemIndex++
										const isSelected = itemIndex === selectedIndex
										const currentIndex = itemIndex
										return (
											<button
												key={cmd.id}
												type="button"
												data-selected={isSelected}
												onClick={() => cmd.action()}
												onMouseEnter={() => setSelectedIndex(currentIndex)}
												className={cx(
													'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
													'cursor-pointer outline-none',
													isSelected ? 'bg-accent/15' : 'hover:bg-white/5',
												)}
											>
												<div
													className={cx(
														'flex items-center justify-center size-[32px] rounded-lg shrink-0',
														isSelected
															? 'bg-accent text-white'
															: 'bg-white/10 text-secondary',
													)}
												>
													{cmd.icon}
												</div>
												<div className="flex-1 min-w-0">
													<div
														className={cx(
															'text-[14px] font-medium',
															isSelected ? 'text-primary' : 'text-primary',
														)}
													>
														{cmd.label}
													</div>
													{cmd.description && (
														<div className="text-[12px] text-tertiary truncate">
															{cmd.description}
														</div>
													)}
												</div>
												{cmd.shortcut && (
													<div className="hidden sm:flex items-center gap-1 shrink-0">
														{cmd.shortcut.map((key) => (
															<kbd
																key={key}
																className="flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] text-tertiary bg-white/5 rounded border border-white/10"
															>
																{key}
															</kbd>
														))}
													</div>
												)}
												{isSelected && (
													<ArrowRightIcon className="size-[14px] text-accent shrink-0 sm:hidden" />
												)}
											</button>
										)
									})}
								</div>
							)
						})
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-4 py-2.5 border-t border-white/10 bg-white/5">
					<div className="flex items-center gap-3 text-[11px] text-tertiary">
						<span className="flex items-center gap-1">
							<kbd className="flex items-center justify-center size-[18px] bg-white/5 rounded border border-white/10">
								↑
							</kbd>
							<kbd className="flex items-center justify-center size-[18px] bg-white/5 rounded border border-white/10">
								↓
							</kbd>
							<span className="ml-1">Navigate</span>
						</span>
						<span className="flex items-center gap-1">
							<kbd className="flex items-center justify-center h-[18px] px-1.5 bg-white/5 rounded border border-white/10 text-[10px]">
								↵
							</kbd>
							<span className="ml-1">Select</span>
						</span>
					</div>
					<div className="flex items-center gap-1.5 text-[11px] text-tertiary">
						<CommandIcon className="size-[12px]" />
						<span>K to toggle</span>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	)
}
