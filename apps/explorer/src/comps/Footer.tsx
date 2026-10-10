import { Link as RouterLink } from '@tanstack/react-router'
import { IconButton, style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
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
import { pressDown, transitionColors } from '#styles/explorer'
import MoonIcon from '~icons/lucide/moon'
import SunIcon from '~icons/lucide/sun'

export function Footer(): React.JSX.Element {
	return (
		<footer {...styles.footer()}>
			<div {...styles.row()}>
				<Footer.ThemeToggle />
				<ul {...styles.links()}>
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

		// TDS IconButton owns size, fill, radius, and focus ring. The local
		// style only adds what IconButton leaves unset (placement, hover, motion),
		// because an external class cannot reliably override its own properties.
		return (
			<IconButton
				{...cx(styles.themeToggle(), pressDown(), transitionColors())}
				aria-label={`Switch to ${nextTheme} mode`}
				onClick={() => {
					persistThemeMode(nextTheme)
					setTheme(nextTheme)
				}}
				scale="medium"
				title={`Switch to ${nextTheme} mode`}
				variant="secondary"
			>
				{nextTheme === 'light' ? <SunIcon /> : <MoonIcon />}
			</IconButton>
		)
	}

	export function Link(props: Link.Props): React.JSX.Element {
		const { to, params, children, external } = props
		return (
			<li {...styles.item()}>
				<RouterLink
					to={to}
					params={params}
					{...cx(styles.link(), pressDown(), transitionColors())}
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

namespace styles {
	export const footer = style({
		containerType: 'inline-size',
		paddingBottom: '48',
		paddingInline: 'page.margin',
		paddingTop: '24',
		position: 'relative',
		'@media print': { display: 'none' },
	})

	export const row = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '20',
		justifyContent: 'center',
		minHeight: '40',
		position: 'relative',
		'@container (width < 399px)': { flexDirection: 'column-reverse' },
	})

	export const links = style({
		alignItems: 'center',
		display: 'flex',
		gap: '20',
		justifyContent: 'center',
		listStyle: 'none',
		margin: 'none',
		padding: 'none',
		typography: 'body.b2',
		userSelect: 'none',
		'@media (width >= 640px)': { gap: '24' },
	})

	export const item = style({ display: 'flex' })

	export const link = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'inline-flex',
		minHeight: '44px !custom',
		textDecorationLine: 'none',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
		'@media (width >= 640px)': { minHeight: '32' },
	})

	export const themeToggle = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
		'@container (width >= 400px)': {
			left: '0px !custom',
			position: 'absolute',
			top: '50% !custom',
			translate: '0 -50% !custom',
		},
	})
}
