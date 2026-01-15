import { useNavigate, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useAccount, useConnect, useConnectors, useDisconnect } from 'wagmi'
import i18n from '#lib/i18n'
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
import ArrowLeftIcon from '~icons/lucide/arrow-left'
import ClipboardIcon from '~icons/lucide/clipboard-paste'
import LanguagesIcon from '~icons/lucide/languages'
import CheckIcon from '~icons/lucide/check'
import ChevronRightIcon from '~icons/lucide/chevron-right'

const LANGUAGES = [
	{ code: 'en', name: 'English' },
	{ code: 'es', name: 'Español' },
	{ code: 'zh', name: '中文' },
	{ code: 'ja', name: '日本語' },
	{ code: 'ko', name: '한국어' },
	{ code: 'el', name: 'Ελληνικά' },
]

type MenuView = 'main' | 'send' | 'language'

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
	const [mounted, setMounted] = React.useState(false)

	React.useEffect(() => {
		setMounted(true)
	}, [])

	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault()
				e.stopPropagation()
				setOpen((o) => !o)
			}
		}
		window.addEventListener('keydown', down)
		return () => window.removeEventListener('keydown', down)
	}, [])

	return (
		<CommandMenuContext.Provider value={{ open, setOpen }}>
			{children}
			{mounted && <CommandMenuPortal open={open} onOpenChange={setOpen} />}
		</CommandMenuContext.Provider>
	)
}

export function useCommandMenu() {
	const ctx = React.useContext(CommandMenuContext)
	if (!ctx)
		throw new Error('useCommandMenu must be used within CommandMenuProvider')
	return ctx
}

type Command = {
	id: string
	label: string
	icon: React.ReactNode
	onSelect: () => void
	shortcut?: string
	keywords?: string[]
	hasSubmenu?: boolean
}

type CommandGroup = {
	label: string
	commands: Command[]
}

function CommandMenuPortal({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [view, setView] = React.useState<MenuView>('main')
	const [query, setQuery] = React.useState('')
	const [selectedIndex, setSelectedIndex] = React.useState(0)
	const [sendAddress, setSendAddress] = React.useState('')
	const [visible, setVisible] = React.useState(false)
	const inputRef = React.useRef<HTMLInputElement>(null)
	const listRef = React.useRef<HTMLDivElement>(null)

	const navigate = useNavigate()
	const router = useRouter()
	const account = useAccount()
	const { disconnect } = useDisconnect()
	const { connect } = useConnect()
	const [connector] = useConnectors()

	const close = React.useCallback(() => {
		setVisible(false)
		setTimeout(() => {
			onOpenChange(false)
			setView('main')
			setQuery('')
			setSendAddress('')
			setSelectedIndex(0)
		}, 120)
	}, [onOpenChange])

	React.useEffect(() => {
		if (open) {
			setVisible(true)
			setTimeout(() => inputRef.current?.focus(), 10)
		}
	}, [open])

	React.useEffect(() => {
		setSelectedIndex(0)
	}, [])

	// Scroll selected into view
	React.useEffect(() => {
		const el = listRef.current?.querySelector('[data-selected="true"]')
		el?.scrollIntoView({ block: 'nearest' })
	}, [])

	const commandGroups = React.useMemo((): CommandGroup[] => {
		const groups: CommandGroup[] = []

		// Navigation
		const nav: Command[] = [
			{
				id: 'home',
				label: 'Go Home',
				icon: <HomeIcon />,
				shortcut: 'G H',
				onSelect: () => {
					navigate({ to: '/' })
					close()
				},
				keywords: ['home', 'start', 'back'],
			},
		]

		if (account.address) {
			nav.push({
				id: 'account',
				label: 'My Account',
				icon: <WalletIcon />,
				shortcut: 'G A',
				onSelect: () => {
					navigate({ to: '/$address', params: { address: account.address! } })
					close()
				},
				keywords: ['account', 'wallet', 'portfolio', 'balance'],
			})
		}

		groups.push({ label: 'Navigation', commands: nav })

		// Actions
		if (account.address) {
			const actions: Command[] = [
				{
					id: 'send',
					label: 'Send Tokens',
					icon: <SendIcon />,
					onSelect: () => setView('send'),
					keywords: ['send', 'transfer', 'pay'],
					hasSubmenu: true,
				},
				{
					id: 'refresh',
					label: 'Refresh Data',
					icon: <RefreshCwIcon />,
					shortcut: 'R',
					onSelect: () => {
						router.invalidate()
						close()
					},
					keywords: ['refresh', 'reload', 'sync'],
				},
			]
			groups.push({ label: 'Actions', commands: actions })
		}

		// Account
		const acct: Command[] = []
		if (account.address) {
			acct.push({
				id: 'signout',
				label: 'Sign Out',
				icon: <LogOutIcon />,
				onSelect: () => {
					disconnect()
					navigate({ to: '/' })
					close()
				},
				keywords: ['logout', 'disconnect', 'signout', 'exit'],
			})
		} else {
			acct.push({
				id: 'signup',
				label: 'Create Account',
				icon: <KeyIcon />,
				onSelect: () => {
					if (connector)
						connect({
							connector,
							capabilities: { type: 'sign-up' },
						} as Parameters<typeof connect>[0])
					close()
				},
				keywords: ['signup', 'register', 'create', 'new'],
			})
			acct.push({
				id: 'signin',
				label: 'Sign In',
				icon: <FingerprintIcon />,
				onSelect: () => {
					if (connector) connect({ connector })
					close()
				},
				keywords: ['signin', 'login', 'connect'],
			})
		}
		groups.push({ label: 'Account', commands: acct })

		// Settings
		const settings: Command[] = [
			{
				id: 'language',
				label: 'Change Language',
				icon: <LanguagesIcon />,
				onSelect: () => setView('language'),
				keywords: ['language', 'locale', 'translate', 'i18n'],
				hasSubmenu: true,
			},
		]
		groups.push({ label: 'Settings', commands: settings })

		// Links
		const links: Command[] = [
			{
				id: 'website',
				label: 'Tempo Website',
				icon: <GlobeIcon />,
				onSelect: () => {
					window.open('https://tempo.xyz', '_blank')
					close()
				},
				keywords: ['website', 'tempo', 'home'],
			},
			{
				id: 'docs',
				label: 'Documentation',
				icon: <BookOpenIcon />,
				onSelect: () => {
					window.open('https://docs.tempo.xyz', '_blank')
					close()
				},
				keywords: ['docs', 'help', 'guide', 'learn'],
			},
		]
		if (account.address) {
			links.push({
				id: 'explorer',
				label: 'View on Explorer',
				icon: <ExternalLinkIcon />,
				onSelect: () => {
					window.open(
						`https://explore.mainnet.tempo.xyz/address/${account.address}`,
						'_blank',
					)
					close()
				},
				keywords: ['explorer', 'block', 'etherscan'],
			})
		}
		groups.push({ label: 'Links', commands: links })

		return groups
	}, [account.address, navigate, close, disconnect, connect, connector, router])

	const filteredGroups = React.useMemo((): CommandGroup[] => {
		if (!query) return commandGroups
		const q = query.toLowerCase()
		return commandGroups
			.map((g) => ({
				...g,
				commands: g.commands.filter(
					(c) =>
						c.label.toLowerCase().includes(q) ||
						c.keywords?.some((k) => k.includes(q)),
				),
			}))
			.filter((g) => g.commands.length > 0)
	}, [commandGroups, query])

	const flatCommands = React.useMemo(
		() => filteredGroups.flatMap((g) => g.commands),
		[filteredGroups],
	)

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (view !== 'main') {
					setView('main')
					setQuery('')
					setSendAddress('')
				} else {
					close()
				}
			} else if (e.key === 'ArrowDown') {
				e.preventDefault()
				if (view === 'main') {
					setSelectedIndex((i) => Math.min(i + 1, flatCommands.length - 1))
				} else if (view === 'language') {
					setSelectedIndex((i) => Math.min(i + 1, LANGUAGES.length - 1))
				}
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				setSelectedIndex((i) => Math.max(i - 1, 0))
			} else if (e.key === 'Enter') {
				e.preventDefault()
				if (view === 'main' && flatCommands[selectedIndex]) {
					flatCommands[selectedIndex].onSelect()
				} else if (
					view === 'send' &&
					sendAddress.match(/^0x[a-fA-F0-9]{40}$/)
				) {
					navigate({
						to: '/$address',
						params: { address: account.address! },
						search: { sendTo: sendAddress },
					})
					close()
				} else if (view === 'language' && LANGUAGES[selectedIndex]) {
					const lang = LANGUAGES[selectedIndex].code
					i18n.changeLanguage(lang)
					localStorage.setItem('tempo-language', lang)
					close()
				}
			} else if (
				e.key === 'Backspace' &&
				view !== 'main' &&
				!query &&
				!sendAddress
			) {
				setView('main')
			}
		},
		[
			view,
			flatCommands,
			selectedIndex,
			close,
			sendAddress,
			navigate,
			account.address,
			query,
		],
	)

	const pasteFromClipboard = async () => {
		try {
			const text = await navigator.clipboard.readText()
			if (text.match(/^0x[a-fA-F0-9]{40}$/)) {
				setSendAddress(text)
			}
		} catch {}
	}

	if (!open) return null

	const isMac =
		typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
	let globalIndex = -1

	return createPortal(
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled via onKeyDown
		<div
			className={cx(
				'fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4',
				'transition-opacity duration-100',
				visible ? 'bg-black/50' : 'bg-transparent opacity-0',
			)}
			onClick={close}
			onKeyDown={handleKeyDown}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: container only stops propagation */}
			<div
				className={cx(
					'w-full max-w-[520px] rounded-xl overflow-hidden',
					'bg-[#232326] border border-[#3a3a3c]',
					'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]',
					'transition-all duration-100',
					visible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]',
				)}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Search Input */}
				<div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-[#3a3a3c]">
					{view !== 'main' ? (
						<button
							type="button"
							onClick={() => {
								setView('main')
								setQuery('')
								setSendAddress('')
							}}
							className="p-1 -ml-1 rounded-md hover:bg-white/10 transition-colors"
						>
							<ArrowLeftIcon className="size-4 text-[#98989f]" />
						</button>
					) : (
						<SearchIcon className="size-4 text-[#98989f] shrink-0" />
					)}

					{view === 'main' && (
						<input
							ref={inputRef}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search commands..."
							className="flex-1 bg-transparent text-[#f5f5f7] placeholder:text-[#6e6e73] outline-none text-[15px]"
							autoComplete="off"
							spellCheck={false}
						/>
					)}
					{view === 'send' && (
						<input
							ref={inputRef}
							value={sendAddress}
							onChange={(e) => setSendAddress(e.target.value)}
							placeholder="Recipient address (0x...)"
							className="flex-1 bg-transparent text-[#f5f5f7] placeholder:text-[#6e6e73] outline-none text-[14px] font-mono"
							autoComplete="off"
							spellCheck={false}
						/>
					)}
					{view === 'language' && (
						<span className="flex-1 text-[#6e6e73] text-[15px]">
							Select language
						</span>
					)}

					<kbd className="px-1.5 py-0.5 text-[11px] text-[#6e6e73] bg-[#1c1c1e] rounded border border-[#3a3a3c] font-sans">
						{isMac ? '⌘K' : 'Ctrl+K'}
					</kbd>
				</div>

				{/* Content */}
				<div
					ref={listRef}
					className="max-h-[320px] overflow-y-auto overflow-x-hidden"
				>
					{view === 'main' &&
						(filteredGroups.length === 0 ? (
							<div className="px-3.5 py-6 text-center text-[#6e6e73] text-[13px]">
								No results found
							</div>
						) : (
							filteredGroups.map((group) => (
								<div key={group.label} className="py-1">
									<div className="px-3.5 py-1.5 text-[11px] font-medium text-[#6e6e73] uppercase tracking-wide">
										{group.label}
									</div>
									{group.commands.map((cmd) => {
										globalIndex++
										const idx = globalIndex
										const isSelected = idx === selectedIndex
										return (
											<button
												key={cmd.id}
												type="button"
												data-selected={isSelected}
												onClick={cmd.onSelect}
												onMouseEnter={() => setSelectedIndex(idx)}
												className={cx(
													'w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors',
													isSelected ? 'bg-[#3a3a3c]' : 'hover:bg-[#2c2c2e]',
												)}
											>
												<span
													className={cx(
														'flex items-center justify-center size-7 rounded-md [&>svg]:size-4',
														isSelected
															? 'bg-[#0a84ff] text-white'
															: 'bg-[#3a3a3c] text-[#98989f]',
													)}
												>
													{cmd.icon}
												</span>
												<span className="flex-1 text-[14px] text-[#f5f5f7]">
													{cmd.label}
												</span>
												{cmd.shortcut && (
													<span className="flex items-center gap-0.5">
														{cmd.shortcut.split(' ').map((k) => (
															<kbd
																key={k}
																className="px-1.5 py-0.5 text-[11px] text-[#6e6e73] bg-[#1c1c1e] rounded border border-[#3a3a3c]"
															>
																{k}
															</kbd>
														))}
													</span>
												)}
												{cmd.hasSubmenu && (
													<ChevronRightIcon className="size-4 text-[#6e6e73]" />
												)}
											</button>
										)
									})}
								</div>
							))
						))}

					{view === 'send' && (
						<div className="p-2">
							<button
								type="button"
								onClick={pasteFromClipboard}
								className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[#2c2c2e] transition-colors"
							>
								<span className="flex items-center justify-center size-7 rounded-md bg-[#3a3a3c] text-[#98989f]">
									<ClipboardIcon className="size-4" />
								</span>
								<span className="text-[14px] text-[#f5f5f7]">
									Paste from clipboard
								</span>
							</button>
							{sendAddress && (
								<div className="mt-2">
									{sendAddress.match(/^0x[a-fA-F0-9]{40}$/) ? (
										<button
											type="button"
											onClick={() => {
												navigate({
													to: '/$address',
													params: { address: account.address! },
													search: { sendTo: sendAddress },
												})
												close()
											}}
											className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#0a84ff]/20 hover:bg-[#0a84ff]/30 border border-[#0a84ff]/30 transition-colors"
										>
											<span className="flex items-center justify-center size-7 rounded-md bg-[#0a84ff] text-white">
												<SendIcon className="size-4" />
											</span>
											<span className="text-[14px] text-[#f5f5f7]">
												Send to{' '}
												<span className="font-mono text-[#0a84ff]">
													{sendAddress.slice(0, 6)}...{sendAddress.slice(-4)}
												</span>
											</span>
										</button>
									) : (
										<div className="px-3 py-2.5 rounded-lg bg-[#ff453a]/10 border border-[#ff453a]/20">
											<span className="text-[13px] text-[#ff453a]">
												Invalid address format
											</span>
										</div>
									)}
								</div>
							)}
						</div>
					)}

					{view === 'language' && (
						<div className="py-1">
							{LANGUAGES.map((lang, i) => {
								const isActive = i18n.language === lang.code
								const isSelected = i === selectedIndex
								return (
									<button
										key={lang.code}
										type="button"
										data-selected={isSelected}
										onClick={() => {
											i18n.changeLanguage(lang.code)
											localStorage.setItem('tempo-language', lang.code)
											close()
										}}
										onMouseEnter={() => setSelectedIndex(i)}
										className={cx(
											'w-full flex items-center justify-between px-3.5 py-2 transition-colors',
											isSelected ? 'bg-[#3a3a3c]' : 'hover:bg-[#2c2c2e]',
										)}
									>
										<span className="text-[14px] text-[#f5f5f7]">
											{lang.name}
										</span>
										{isActive && (
											<CheckIcon className="size-4 text-[#30d158]" />
										)}
									</button>
								)
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center gap-4 px-3.5 py-2 border-t border-[#3a3a3c] bg-[#1c1c1e]">
					<span className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
						<kbd className="px-1 py-0.5 bg-[#232326] rounded border border-[#3a3a3c]">
							↑
						</kbd>
						<kbd className="px-1 py-0.5 bg-[#232326] rounded border border-[#3a3a3c]">
							↓
						</kbd>
						<span>Navigate</span>
					</span>
					<span className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
						<kbd className="px-1 py-0.5 bg-[#232326] rounded border border-[#3a3a3c]">
							↵
						</kbd>
						<span>Open</span>
					</span>
					<span className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
						<kbd className="px-1 py-0.5 bg-[#232326] rounded border border-[#3a3a3c]">
							esc
						</kbd>
						<span>{view !== 'main' ? 'Back' : 'Close'}</span>
					</span>
				</div>
			</div>
		</div>,
		document.body,
	)
}
