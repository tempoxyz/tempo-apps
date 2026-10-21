import { Link as RouterLink } from '@tanstack/react-router'
import * as React from 'react'
import {
	applyThemeMode,
	defaultThemeMode,
	getInitialThemeMode,
	getStoredThemeMode,
	getSystemThemeMode,
	isThemeMode,
	persistThemeMode,
	themeMediaQuery,
	themeStorageKey,
	type ThemeMode,
} from '#lib/theme'
import MoonIcon from '~icons/lucide/moon'
import SunIcon from '~icons/lucide/sun'

export function Footer(): React.JSX.Element {
	return (
		<footer className="@container px-[24px] @min-[1240px]:px-[84px] pt-[24px] pb-[48px] relative print:hidden">
			<div className="relative flex min-h-[34px] flex-wrap items-center justify-center gap-5 @max-[399px]:flex-col-reverse">
				<Footer.ThemeToggle />
				<ul className="text-ui-meta flex items-center justify-center gap-5 sm:gap-6 select-none">
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
					: getSystemThemeMode()
				setTheme(updatedTheme)
				applyThemeMode(updatedTheme)
			}
			const colorScheme = window.matchMedia(themeMediaQuery)
			const handleColorScheme = (event: MediaQueryListEvent) => {
				if (getStoredThemeMode()) return

				const updatedTheme = event.matches ? 'light' : 'dark'
				setTheme(updatedTheme)
				applyThemeMode(updatedTheme)
			}

			window.addEventListener('storage', handleStorage)
			colorScheme.addEventListener('change', handleColorScheme)
			return () => {
				window.removeEventListener('storage', handleStorage)
				colorScheme.removeEventListener('change', handleColorScheme)
			}
		}, [])

		return (
			<button
				type="button"
				onClick={() => {
					persistThemeMode(nextTheme)
					setTheme(nextTheme)
				}}
				className="@min-[400px]:absolute @min-[400px]:left-0 @min-[400px]:top-1/2 grid size-11 sm:size-[34px] @min-[400px]:-translate-y-1/2 cursor-pointer place-items-center rounded-body border border-base-border bg-base-plane-interactive text-secondary transition-colors press-down hover:bg-surface hover:text-primary"
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
					className="press-down inline-flex min-h-11 sm:min-h-8 items-center hover:text-secondary transition-colors"
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
