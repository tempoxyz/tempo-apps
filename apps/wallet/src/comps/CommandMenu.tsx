import { useNavigate, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAccount, useConnect, useConnectors, useDisconnect } from 'wagmi'
import i18n from '#lib/i18n'
import { cx } from '#lib/css'
import { useAnnounce } from '#lib/a11y'

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
	{ code: 'de', name: 'Deutsch' },
	{ code: 'fr', name: 'Français' },
	{ code: 'pt', name: 'Português' },
	{ code: 'ru', name: 'Русский' },
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
	iconBg?: string
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
	const { t } = useTranslation()
	const { announce } = useAnnounce()
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

	const isMac =
		typeof navigator !== 'undefined' &&
		/Mac|iPhone|iPad/.test(navigator.userAgent)

	const close = React.useCallback(() => {
		setVisible(false)
		announce(t('commandMenu.closed'))
		setTimeout(() => {
			onOpenChange(false)
			setView('main')
			setQuery('')
			setSendAddress('')
			setSelectedIndex(0)
		}, 150)
	}, [onOpenChange, announce, t])

	React.useEffect(() => {
		if (open) {
			setVisible(true)
			announce(t('commandMenu.opened'))
			setTimeout(() => inputRef.current?.focus(), 10)
		}
	}, [open, announce, t])

	React.useEffect(() => {
		setSelectedIndex(0)
	}, [])

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
				label: t('commandMenu.home'),
				icon: <HomeIcon />,
				iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600',
				shortcut: 'G H',
				onSelect: () => {
					navigate({ to: '/' })
					close()
				},
				keywords: ['home', 'start', 'back'],
			},
		]

		if (account.address) {
			const addr = account.address
			nav.push({
				id: 'account',
				label: t('commandMenu.myAccount'),
				icon: <WalletIcon />,
				iconBg: 'bg-gradient-to-br from-purple-500 to-purple-600',
				shortcut: 'G A',
				onSelect: () => {
					navigate({ to: '/$address', params: { address: addr } })
					close()
				},
				keywords: ['account', 'wallet', 'portfolio', 'balance'],
			})
		}

		groups.push({ label: t('commandMenu.navigation'), commands: nav })

		// Actions
		if (account.address) {
			const actions: Command[] = [
				{
					id: 'send',
					label: t('commandMenu.sendTokens'),
					icon: <SendIcon />,
					iconBg: 'bg-gradient-to-br from-cyan-500 to-cyan-600',
					onSelect: () => setView('send'),
					keywords: ['send', 'transfer', 'pay'],
					hasSubmenu: true,
				},
				{
					id: 'refresh',
					label: t('commandMenu.refreshData'),
					icon: <RefreshCwIcon />,
					iconBg: 'bg-gradient-to-br from-green-500 to-green-600',
					shortcut: 'R',
					onSelect: () => {
						router.invalidate()
						close()
					},
					keywords: ['refresh', 'reload', 'sync'],
				},
			]
			groups.push({ label: t('commandMenu.actions'), commands: actions })
		}

		// Account
		const acct: Command[] = []
		if (account.address) {
			acct.push({
				id: 'signout',
				label: t('commandMenu.signOut'),
				icon: <LogOutIcon />,
				iconBg: 'bg-gradient-to-br from-red-500 to-red-600',
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
				label: t('commandMenu.createAccount'),
				icon: <KeyIcon />,
				iconBg: 'bg-gradient-to-br from-amber-500 to-amber-600',
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
				label: t('commandMenu.signIn'),
				icon: <FingerprintIcon />,
				iconBg: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
				onSelect: () => {
					if (connector) connect({ connector })
					close()
				},
				keywords: ['signin', 'login', 'connect'],
			})
		}
		groups.push({ label: t('commandMenu.account'), commands: acct })

		// Settings
		const settings: Command[] = [
			{
				id: 'language',
				label: t('commandMenu.changeLanguage'),
				icon: <LanguagesIcon />,
				iconBg: 'bg-gradient-to-br from-pink-500 to-pink-600',
				onSelect: () => setView('language'),
				keywords: ['language', 'translate', 'locale', 'i18n'],
				hasSubmenu: true,
			},
		]
		groups.push({ label: t('commandMenu.settings'), commands: settings })

		// Links
		const links: Command[] = [
			{
				id: 'website',
				label: t('commandMenu.tempoWebsite'),
				icon: <GlobeIcon />,
				iconBg: 'bg-gradient-to-br from-slate-500 to-slate-600',
				onSelect: () => {
					window.open('https://tempo.xyz', '_blank')
					close()
				},
				keywords: ['website', 'tempo', 'main'],
			},
			{
				id: 'docs',
				label: t('commandMenu.documentation'),
				icon: <BookOpenIcon />,
				iconBg: 'bg-gradient-to-br from-orange-500 to-orange-600',
				onSelect: () => {
					window.open('https://docs.tempo.xyz', '_blank')
					close()
				},
				keywords: ['docs', 'documentation', 'help', 'guide'],
			},
		]

		if (account.address) {
			links.push({
				id: 'explorer',
				label: t('commandMenu.viewOnExplorer'),
				icon: <ExternalLinkIcon />,
				iconBg: 'bg-gradient-to-br from-teal-500 to-teal-600',
				onSelect: () => {
					window.open(
						`https://explore.mainnet.tempo.xyz/address/${account.address}`,
						'_blank',
					)
					close()
				},
				keywords: ['explorer', 'block', 'transactions'],
			})
		}
		groups.push({ label: t('commandMenu.links'), commands: links })

		return groups
	}, [
		t,
		account.address,
		navigate,
		close,
		router,
		disconnect,
		connect,
		connector,
	])

	const filteredGroups = React.useMemo(() => {
		if (!query.trim()) return commandGroups

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

	const flatItems = React.useMemo(() => {
		if (view === 'language') return LANGUAGES
		return filteredGroups.flatMap((g) => g.commands)
	}, [view, filteredGroups])

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1))
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				setSelectedIndex((i) => Math.max(i - 1, 0))
			} else if (e.key === 'Enter') {
				e.preventDefault()
				const item = flatItems[selectedIndex]
				if (view === 'language' && 'code' in item) {
					i18n.changeLanguage(item.code)
					localStorage.setItem('tempo-language', item.code)
					close()
				} else if ('onSelect' in item) {
					item.onSelect()
				}
			} else if (e.key === 'Escape') {
				e.preventDefault()
				if (view !== 'main') {
					setView('main')
					setQuery('')
					setSendAddress('')
					setSelectedIndex(0)
				} else {
					close()
				}
			} else if (e.key === 'Backspace' && !query && view !== 'main') {
				setView('main')
				setSendAddress('')
				setSelectedIndex(0)
			}
		},
		[flatItems, selectedIndex, view, query, close],
	)

	const pasteFromClipboard = async () => {
		try {
			const text = await navigator.clipboard.readText()
			setSendAddress(text.trim())
		} catch {
			// ignore
		}
	}

	if (!open) return null

	let globalIndex = -1

	return createPortal(
		<div
			className={cx(
				'fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm transition-opacity duration-150',
				visible ? 'opacity-100' : 'opacity-0',
			)}
			onClick={close}
			onKeyDown={handleKeyDown}
		>
			<div
				className={cx(
					'w-[640px] max-w-[90vw] rounded-2xl overflow-hidden shadow-2xl transition-all duration-150',
					'bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10',
					visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
				)}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Search Header */}
				<div className="flex items-center gap-4 px-5 h-16 border-b border-white/10">
					{view !== 'main' ? (
						<button
							type="button"
							onClick={() => {
								setView('main')
								setSendAddress('')
								setSelectedIndex(0)
							}}
							className="flex items-center justify-center size-10 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
						>
							<ArrowLeftIcon className="size-5 text-white/60" />
						</button>
					) : (
						<SearchIcon className="size-6 text-white/40 shrink-0" />
					)}

					{view === 'main' && (
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={t('commandMenu.searchPlaceholder')}
							className="flex-1 bg-transparent text-[17px] text-white placeholder:text-white/40 outline-none"
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
						/>
					)}
					{view === 'send' && (
						<input
							ref={inputRef}
							type="text"
							value={sendAddress}
							onChange={(e) => setSendAddress(e.target.value)}
							placeholder={t('commandMenu.sendSubmenu.enterAddress')}
							className="flex-1 bg-transparent text-[17px] text-white placeholder:text-white/40 outline-none font-mono"
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
						/>
					)}
					{view === 'language' && (
						<span className="flex-1 text-[17px] text-white/60">
							{t('commandMenu.languageSubmenu.title')}
						</span>
					)}

					<kbd className="px-2.5 py-1.5 text-[12px] text-white/50 bg-white/5 rounded-lg border border-white/10 font-sans">
						{isMac ? '⌘K' : 'Ctrl+K'}
					</kbd>
				</div>

				{/* Content */}
				<div
					ref={listRef}
					role="menu"
					aria-label={t('commandMenu.title')}
					className="max-h-[400px] overflow-y-auto overflow-x-hidden py-2"
				>
					{view === 'main' &&
						(filteredGroups.length === 0 ? (
							<div className="px-5 py-10 text-center text-white/40 text-[15px]">
								No results found
							</div>
						) : (
							filteredGroups.map((group) => (
								<div key={group.label} role="group" aria-label={group.label}>
									<div className="px-5 py-2 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
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
												role="menuitem"
												aria-label={cmd.label}
												data-selected={isSelected}
												onClick={cmd.onSelect}
												onMouseEnter={() => setSelectedIndex(idx)}
												className={cx(
													'w-full flex items-center gap-4 px-4 py-3 mx-2 rounded-xl transition-all focus-ring',
													isSelected ? 'bg-[#0a84ff]' : 'hover:bg-white/5',
												)}
												style={{ width: 'calc(100% - 16px)' }}
											>
												<span
													className={cx(
														'flex items-center justify-center size-10 rounded-xl text-white shrink-0',
														isSelected ? 'bg-white/20' : cmd.iconBg,
													)}
												>
													<span className="[&>svg]:size-5">{cmd.icon}</span>
												</span>
												<span
													className={cx(
														'flex-1 text-[15px] font-medium text-left',
														isSelected ? 'text-white' : 'text-white/90',
													)}
												>
													{cmd.label}
												</span>
												{cmd.shortcut && (
													<span className="flex items-center gap-1">
														{cmd.shortcut.split(' ').map((k) => (
															<kbd
																key={k}
																className={cx(
																	'min-w-[24px] h-6 flex items-center justify-center text-[12px] font-medium rounded-md px-1.5',
																	isSelected
																		? 'text-white/70 bg-white/20'
																		: 'text-white/50 bg-white/10',
																)}
															>
																{k}
															</kbd>
														))}
													</span>
												)}
												{cmd.hasSubmenu && (
													<ChevronRightIcon
														className={cx(
															'size-5',
															isSelected ? 'text-white/70' : 'text-white/40',
														)}
													/>
												)}
											</button>
										)
									})}
								</div>
							))
						))}

					{view === 'send' && (
						<div className="px-2 py-2">
							<button
								type="button"
								role="menuitem"
								onClick={pasteFromClipboard}
								aria-label={t('commandMenu.sendSubmenu.pasteFromClipboard')}
								className="w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors focus-ring"
							>
								<span className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white">
									<ClipboardIcon className="size-5" />
								</span>
								<span className="text-[15px] font-medium text-white/90">
									{t('commandMenu.sendSubmenu.pasteFromClipboard')}
								</span>
							</button>
							{sendAddress && (
								<div className="mt-2">
									{sendAddress.match(/^0x[a-fA-F0-9]{40}$/) &&
									account.address ? (
										<button
											type="button"
											role="menuitem"
											onClick={() => {
												if (!account.address) return
												navigate({
													to: '/$address',
													params: { address: account.address },
													search: { sendTo: sendAddress },
												})
												close()
											}}
											aria-label={`${t('commandMenu.sendSubmenu.sendTo')} ${sendAddress}`}
											className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-[#0a84ff] hover:bg-[#0a84ff]/90 transition-colors focus-ring"
										>
											<span className="flex items-center justify-center size-10 rounded-xl bg-white/20 text-white">
												<SendIcon className="size-5" />
											</span>
											<span className="text-[15px] font-medium text-white">
												{t('commandMenu.sendSubmenu.sendTo')}{' '}
												<span className="font-mono opacity-80">
													{sendAddress.slice(0, 8)}...{sendAddress.slice(-6)}
												</span>
											</span>
										</button>
									) : sendAddress &&
										!sendAddress.match(/^0x[a-fA-F0-9]{40}$/) ? (
										<div
											role="alert"
											className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20"
										>
											<span className="text-[14px] text-red-400">
												{t('commandMenu.sendSubmenu.invalidAddress')}
											</span>
										</div>
									) : null}
								</div>
							)}
						</div>
					)}

					{view === 'language' && (
						<div className="px-2 py-1">
							{LANGUAGES.map((lang, i) => {
								const isActive = i18n.language === lang.code
								const isSelected = i === selectedIndex
								return (
									<button
										key={lang.code}
										type="button"
										role="menuitemradio"
										aria-checked={isActive}
										aria-label={lang.name}
										data-selected={isSelected}
										onClick={() => {
											i18n.changeLanguage(lang.code)
											localStorage.setItem('tempo-language', lang.code)
											close()
										}}
										onMouseEnter={() => setSelectedIndex(i)}
										className={cx(
											'w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all focus-ring',
											isSelected ? 'bg-[#0a84ff]' : 'hover:bg-white/5',
										)}
									>
										<span
											className={cx(
												'text-[15px] font-medium',
												isSelected ? 'text-white' : 'text-white/90',
											)}
										>
											{lang.name}
										</span>
										{isActive && (
											<CheckIcon
												className={cx(
													'size-5',
													isSelected ? 'text-white' : 'text-green-400',
												)}
											/>
										)}
									</button>
								)
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center gap-6 px-5 h-12 border-t border-white/10 bg-white/5 text-[12px] text-white/40">
					<span className="flex items-center gap-2">
						<kbd className="px-1.5 py-0.5 bg-white/10 rounded-md border border-white/10">
							↑
						</kbd>
						<kbd className="px-1.5 py-0.5 bg-white/10 rounded-md border border-white/10">
							↓
						</kbd>
						<span>Navigate</span>
					</span>
					<span className="flex items-center gap-2">
						<kbd className="px-2 py-0.5 bg-white/10 rounded-md border border-white/10">
							↵
						</kbd>
						<span>Open</span>
					</span>
					<span className="flex items-center gap-2">
						<kbd className="px-2 py-0.5 bg-white/10 rounded-md border border-white/10">
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
