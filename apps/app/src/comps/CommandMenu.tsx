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

export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
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
	if (!ctx) throw new Error('useCommandMenu must be used within CommandMenuProvider')
	return ctx
}

function CommandMenuPortal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const [view, setView] = React.useState<MenuView>('main')
	const [query, setQuery] = React.useState('')
	const [selectedIndex, setSelectedIndex] = React.useState(0)
	const [sendAddress, setSendAddress] = React.useState('')
	const [visible, setVisible] = React.useState(false)
	const inputRef = React.useRef<HTMLInputElement>(null)

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
		}, 150)
	}, [onOpenChange])

	React.useEffect(() => {
		if (open) {
			setVisible(true)
			setTimeout(() => inputRef.current?.focus(), 50)
		}
	}, [open])

	React.useEffect(() => {
		setSelectedIndex(0)
	}, [query, view])

	const mainCommands = React.useMemo(() => {
		const cmds: Array<{
			id: string
			label: string
			icon: React.ReactNode
			onSelect: () => void
			keywords?: string[]
		}> = []

		cmds.push({
			id: 'home',
			label: 'Go Home',
			icon: <HomeIcon className="size-4" />,
			onSelect: () => { navigate({ to: '/' }); close() },
			keywords: ['home', 'start'],
		})

		if (account.address) {
			cmds.push({
				id: 'account',
				label: 'My Account',
				icon: <WalletIcon className="size-4" />,
				onSelect: () => { navigate({ to: '/$address', params: { address: account.address! } }); close() },
				keywords: ['account', 'wallet', 'portfolio'],
			})

			cmds.push({
				id: 'send',
				label: 'Send Tokens →',
				icon: <SendIcon className="size-4" />,
				onSelect: () => setView('send'),
				keywords: ['send', 'transfer', 'pay'],
			})

			cmds.push({
				id: 'refresh',
				label: 'Refresh',
				icon: <RefreshCwIcon className="size-4" />,
				onSelect: () => { router.invalidate(); close() },
				keywords: ['refresh', 'reload'],
			})

			cmds.push({
				id: 'explorer',
				label: 'View on Explorer',
				icon: <ExternalLinkIcon className="size-4" />,
				onSelect: () => { window.open(`https://explore.mainnet.tempo.xyz/address/${account.address}`, '_blank'); close() },
				keywords: ['explorer', 'block'],
			})

			cmds.push({
				id: 'signout',
				label: 'Sign Out',
				icon: <LogOutIcon className="size-4" />,
				onSelect: () => { disconnect(); navigate({ to: '/' }); close() },
				keywords: ['logout', 'disconnect', 'signout'],
			})
		} else {
			cmds.push({
				id: 'signup',
				label: 'Create Account',
				icon: <KeyIcon className="size-4" />,
				onSelect: () => { if (connector) connect({ connector, capabilities: { type: 'sign-up' } } as Parameters<typeof connect>[0]); close() },
				keywords: ['signup', 'register', 'create'],
			})

			cmds.push({
				id: 'signin',
				label: 'Sign In',
				icon: <FingerprintIcon className="size-4" />,
				onSelect: () => { if (connector) connect({ connector }); close() },
				keywords: ['signin', 'login'],
			})
		}

		cmds.push({
			id: 'language',
			label: 'Change Language →',
			icon: <LanguagesIcon className="size-4" />,
			onSelect: () => setView('language'),
			keywords: ['language', 'locale', 'translate'],
		})

		cmds.push({
			id: 'website',
			label: 'Tempo Website',
			icon: <GlobeIcon className="size-4" />,
			onSelect: () => { window.open('https://tempo.xyz', '_blank'); close() },
			keywords: ['website', 'tempo'],
		})

		cmds.push({
			id: 'docs',
			label: 'Documentation',
			icon: <BookOpenIcon className="size-4" />,
			onSelect: () => { window.open('https://docs.tempo.xyz', '_blank'); close() },
			keywords: ['docs', 'help', 'guide'],
		})

		return cmds
	}, [account.address, navigate, close, disconnect, connect, connector, router])

	const filteredCommands = React.useMemo(() => {
		if (!query) return mainCommands
		const q = query.toLowerCase()
		return mainCommands.filter(c => 
			c.label.toLowerCase().includes(q) || 
			c.keywords?.some(k => k.includes(q))
		)
	}, [mainCommands, query])

	const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			if (view !== 'main') {
				setView('main')
				setQuery('')
			} else {
				close()
			}
		} else if (e.key === 'ArrowDown') {
			e.preventDefault()
			if (view === 'main') {
				setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1))
			} else if (view === 'language') {
				setSelectedIndex(i => Math.min(i + 1, LANGUAGES.length - 1))
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			setSelectedIndex(i => Math.max(i - 1, 0))
		} else if (e.key === 'Enter') {
			e.preventDefault()
			if (view === 'main' && filteredCommands[selectedIndex]) {
				filteredCommands[selectedIndex].onSelect()
			} else if (view === 'send' && sendAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
				navigate({ to: '/$address', params: { address: account.address! }, search: { sendTo: sendAddress } })
				close()
			} else if (view === 'language' && LANGUAGES[selectedIndex]) {
				const lang = LANGUAGES[selectedIndex].code
				i18n.changeLanguage(lang)
				localStorage.setItem('tempo-language', lang)
				close()
			}
		} else if (e.key === 'Backspace' && view !== 'main' && !query && !sendAddress) {
			setView('main')
		}
	}, [view, filteredCommands, selectedIndex, close, sendAddress, navigate, account.address, query])

	const pasteFromClipboard = async () => {
		try {
			const text = await navigator.clipboard.readText()
			if (text.match(/^0x[a-fA-F0-9]{40}$/)) {
				setSendAddress(text)
			}
		} catch {}
	}

	if (!open) return null

	const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

	return createPortal(
		<div
			className={cx(
				'fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] px-4',
				'transition-all duration-150',
				visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent',
			)}
			onClick={close}
			onKeyDown={handleKeyDown}
		>
			<div
				className={cx(
					'w-full max-w-lg rounded-2xl overflow-hidden',
					'bg-[#1a1a1a] border border-white/10',
					'shadow-2xl',
					'transition-all duration-150',
					visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
				)}
				onClick={e => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center gap-3 px-4 h-14 border-b border-white/10">
					{view !== 'main' && (
						<button
							type="button"
							onClick={() => { setView('main'); setQuery(''); setSendAddress('') }}
							className="p-1 -ml-1 rounded hover:bg-white/10"
						>
							<ArrowLeftIcon className="size-4 text-white/60" />
						</button>
					)}
					{view === 'main' && <SearchIcon className="size-4 text-white/40" />}
					{view === 'send' && <SendIcon className="size-4 text-white/40" />}
					{view === 'language' && <LanguagesIcon className="size-4 text-white/40" />}
					
					{view === 'main' && (
						<input
							ref={inputRef}
							value={query}
							onChange={e => setQuery(e.target.value)}
							placeholder="Type a command..."
							className="flex-1 bg-transparent text-white placeholder:text-white/40 outline-none text-sm"
							autoComplete="off"
						/>
					)}
					{view === 'send' && (
						<input
							ref={inputRef}
							value={sendAddress}
							onChange={e => setSendAddress(e.target.value)}
							placeholder="Enter recipient address (0x...)"
							className="flex-1 bg-transparent text-white placeholder:text-white/40 outline-none text-sm font-mono"
							autoComplete="off"
						/>
					)}
					{view === 'language' && (
						<span className="text-white/60 text-sm">Select Language</span>
					)}

					<kbd className="hidden sm:block px-2 py-1 text-[10px] text-white/40 bg-white/5 rounded border border-white/10">
						{isMac ? '⌘' : 'Ctrl'}K
					</kbd>
				</div>

				{/* Content */}
				<div className="max-h-80 overflow-y-auto">
					{view === 'main' && (
						<div className="py-2">
							{filteredCommands.length === 0 ? (
								<div className="px-4 py-8 text-center text-white/40 text-sm">No results</div>
							) : (
								filteredCommands.map((cmd, i) => (
									<button
										key={cmd.id}
										type="button"
										onClick={cmd.onSelect}
										onMouseEnter={() => setSelectedIndex(i)}
										className={cx(
											'w-full flex items-center gap-3 px-4 py-2.5 text-left',
											i === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5',
										)}
									>
										<span className={cx(
											'flex items-center justify-center size-8 rounded-lg',
											i === selectedIndex ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/60',
										)}>
											{cmd.icon}
										</span>
										<span className={cx('text-sm', i === selectedIndex ? 'text-white' : 'text-white/80')}>
											{cmd.label}
										</span>
									</button>
								))
							)}
						</div>
					)}

					{view === 'send' && (
						<div className="p-4 space-y-3">
							<button
								type="button"
								onClick={pasteFromClipboard}
								className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
							>
								<ClipboardIcon className="size-4 text-white/60" />
								<span className="text-sm text-white/80">Paste from clipboard</span>
							</button>
							{sendAddress && sendAddress.match(/^0x[a-fA-F0-9]{40}$/) && (
								<button
									type="button"
									onClick={() => {
										navigate({ to: '/$address', params: { address: account.address! }, search: { sendTo: sendAddress } })
										close()
									}}
									className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 transition-colors"
								>
									<SendIcon className="size-4 text-blue-400" />
									<span className="text-sm text-white">Send to {sendAddress.slice(0, 6)}...{sendAddress.slice(-4)}</span>
								</button>
							)}
							{sendAddress && !sendAddress.match(/^0x[a-fA-F0-9]{40}$/) && sendAddress.length > 0 && (
								<div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
									<span className="text-sm text-red-400">Invalid address format</span>
								</div>
							)}
						</div>
					)}

					{view === 'language' && (
						<div className="py-2">
							{LANGUAGES.map((lang, i) => {
								const isActive = i18n.language === lang.code
								return (
									<button
										key={lang.code}
										type="button"
										onClick={() => {
											i18n.changeLanguage(lang.code)
											localStorage.setItem('tempo-language', lang.code)
											close()
										}}
										onMouseEnter={() => setSelectedIndex(i)}
										className={cx(
											'w-full flex items-center justify-between px-4 py-2.5',
											i === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5',
										)}
									>
										<span className={cx('text-sm', i === selectedIndex ? 'text-white' : 'text-white/80')}>
											{lang.name}
										</span>
										{isActive && <CheckIcon className="size-4 text-green-400" />}
									</button>
								)
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-white/5">
					<div className="flex items-center gap-4 text-[11px] text-white/40">
						<span>↑↓ Navigate</span>
						<span>↵ Select</span>
						<span>Esc {view !== 'main' ? 'Back' : 'Close'}</span>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	)
}
