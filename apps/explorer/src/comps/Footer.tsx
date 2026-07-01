import { Link as RouterLink } from '@tanstack/react-router'
import * as React from 'react'
import {
	applyThemeMode,
	defaultThemeMode,
	getInitialThemeMode,
	isThemeMode,
	persistThemeMode,
	themeStorageKey,
	type ThemeMode,
} from '#lib/theme'
import MoonIcon from '~icons/lucide/moon'
import SunIcon from '~icons/lucide/sun'

export function Footer(): React.JSX.Element {
	return (
		<footer className="@container px-[24px] @min-[1240px]:px-[84px] pt-[24px] pb-[48px] relative print:hidden">
			<div className="relative flex min-h-[34px] items-center justify-center">
				<Footer.ThemeToggle />
				<ul className="text-ui-meta flex items-center justify-center gap-[24px] select-none">
					<Footer.Link to="https://tempo.xyz" external>
						About
					</Footer.Link>
					<Footer.Link to="https://docs.tempo.xyz" external>
						Docs
					</Footer.Link>
					<Footer.Link to="https://github.com/tempoxyz" external>
						GitHub
					</Footer.Link>
					<Footer.Link
						to="https://github.com/tempoxyz/tempo-apps/discussions/categories/explorer"
						external
					>
						Feedback
					</Footer.Link>
				</ul>
			</div>
		</footer>
	)
}

export namespace Footer {
	export function ThemeToggle(): React.JSX.Element {
		const [theme, setTheme] = React.useState<ThemeMode>(defaultThemeMode)
		const nextTheme = theme === 'dark' ? 'light' : 'dark'

		React.useEffect(() => {
			const initialTheme = getInitialThemeMode()
			setTheme(initialTheme)
			applyThemeMode(initialTheme)

			const handleStorage = (event: StorageEvent) => {
				if (event.key !== themeStorageKey) return
				const updatedTheme = isThemeMode(event.newValue)
					? event.newValue
					: getInitialThemeMode()
				setTheme(updatedTheme)
				applyThemeMode(updatedTheme)
			}

			window.addEventListener('storage', handleStorage)
			return () => window.removeEventListener('storage', handleStorage)
		}, [])

		return (
			<button
				type="button"
				onClick={() => {
					persistThemeMode(nextTheme)
					setTheme(nextTheme)
				}}
				className="absolute left-0 top-1/2 grid size-[34px] -translate-y-1/2 cursor-pointer place-items-center rounded-[10px] border border-base-border bg-base-plane-interactive text-secondary transition-colors press-down hover:bg-surface hover:text-primary"
				aria-label={`Switch to ${nextTheme} mode`}
				title={`Switch to ${nextTheme} mode`}
			>
				{nextTheme === 'light' ? (
					<SunIcon className="size-[15px]" />
				) : (
					<MoonIcon className="size-[15px]" />
				)}
			</button>
		)
	}

	export function Link(props: Link.Props): React.JSX.Element {
		const { to, params, children, external } = props
		return (
			<li className="flex">
				<RouterLink
					to={to}
					params={params}
					className="press-down"
					target={external ? '_blank' : undefined}
					rel={external ? 'noopener noreferrer' : undefined}
				>
					{children}
				</RouterLink>
			</li>
		)
	}

	export namespace Link {
		export interface Props {
			to: string
			params?: Record<string, string>
			children: React.ReactNode
			external?: boolean
		}
	}
}
