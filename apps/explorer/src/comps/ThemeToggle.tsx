import * as React from 'react'
import { cx } from '#lib/css'
import { useTheme, type Theme } from '#lib/theme'
import Moon from '~icons/lucide/moon'
import Sun from '~icons/lucide/sun'
import Monitor from '~icons/lucide/monitor'

export function ThemeToggle(props: ThemeToggle.Props) {
	const { className } = props
	const { theme, setTheme, resolvedTheme, mounted } = useTheme()
	const [open, setOpen] = React.useState(false)
	const menuRef = React.useRef<HTMLDivElement>(null)
	const buttonRef = React.useRef<HTMLButtonElement>(null)

	React.useEffect(() => {
		if (!open) return
		const handleClick = (e: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node) &&
				buttonRef.current &&
				!buttonRef.current.contains(e.target as Node)
			) {
				setOpen(false)
			}
		}
		document.addEventListener('mousedown', handleClick)
		return () => document.removeEventListener('mousedown', handleClick)
	}, [open])

	if (!mounted) {
		return (
			<div
				className={cx(
					'size-[28px] rounded-full border border-base-border bg-base-alt/50',
					className,
				)}
			/>
		)
	}

	const Icon = resolvedTheme === 'dark' ? Moon : Sun

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				type="button"
				onClick={() => setOpen((o) => !o)}
				className={cx(
					'flex items-center justify-center size-[28px] rounded-full',
					'border border-base-border hover:bg-base-alt cursor-pointer press-down',
					'text-secondary hover:text-primary transition-colors',
					className,
				)}
				title="Toggle theme"
				aria-label="Toggle theme"
			>
				<Icon className="size-[16px]" />
			</button>

			{open && (
				<div
					ref={menuRef}
					className={cx(
						'absolute right-0 mt-2 z-50 min-w-[120px]',
						'bg-surface border border-base-border rounded-[8px] overflow-hidden',
						'shadow-[0px_4px_24px_rgba(0,0,0,0.08)]',
					)}
				>
					<ThemeToggle.Option
						label="Light"
						value="light"
						icon={<Sun className="size-[14px]" />}
						active={theme === 'light'}
						onClick={() => {
							setTheme('light')
							setOpen(false)
						}}
					/>
					<ThemeToggle.Option
						label="Dark"
						value="dark"
						icon={<Moon className="size-[14px]" />}
						active={theme === 'dark'}
						onClick={() => {
							setTheme('dark')
							setOpen(false)
						}}
					/>
					<ThemeToggle.Option
						label="System"
						value="system"
						icon={<Monitor className="size-[14px]" />}
						active={theme === 'system'}
						onClick={() => {
							setTheme('system')
							setOpen(false)
						}}
					/>
				</div>
			)}
		</div>
	)
}

export namespace ThemeToggle {
	export interface Props {
		className?: string
	}

	export function Option(props: Option.Props) {
		const { label, icon, active, onClick } = props

		return (
			<button
				type="button"
				onClick={onClick}
				className={cx(
					'w-full flex items-center gap-[8px] px-[12px] py-[8px]',
					'text-[13px] cursor-pointer hover:bg-base-alt/50 press-down',
					active ? 'text-accent font-medium' : 'text-primary',
				)}
			>
				{icon}
				<span>{label}</span>
			</button>
		)
	}

	export namespace Option {
		export interface Props {
			label: string
			value: Theme
			icon: React.ReactNode
			active: boolean
			onClick: () => void
		}
	}
}
