import { Button, Container, style, Tooltip } from '@tempoxyz/ds'
import { DarkMode, LightMode } from '@tempoxyz/ds/icons'
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

export function Footer(): React.JSX.Element {
	return (
		<Container render={<footer />} size="full" {...styles.footer()}>
			<div {...styles.row()}>
				<Footer.ThemeToggle />
				<ul {...styles.links()}>
					<Footer.Link href="https://tempo.xyz">About</Footer.Link>
					<Footer.Link href="https://docs.tempo.xyz">Docs</Footer.Link>
					<Footer.Link href="https://github.com/tempoxyz">GitHub</Footer.Link>
					<Footer.Link href="https://github.com/tempoxyz/tempo-apps/discussions/categories/explorer">
						Feedback
					</Footer.Link>
				</ul>
			</div>
		</Container>
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

		const label = `Switch to ${nextTheme} mode`

		// The wrapper positions the Button, which keeps its own layout.
		return (
			<div {...styles.themeToggle()}>
				<Tooltip.Root>
					<Tooltip.Trigger
						render={
							<Button
								aria-label={label}
								onClick={() => {
									persistThemeMode(nextTheme)
									setTheme(nextTheme)
								}}
								shape="icon"
								variant="secondary"
							/>
						}
					>
						{nextTheme === 'light' ? <LightMode /> : <DarkMode />}
					</Tooltip.Trigger>
					<Tooltip.Popup>{label}</Tooltip.Popup>
				</Tooltip.Root>
			</div>
		)
	}

	/** An external footer link, opened in a new tab. */
	export function Link(props: Link.Props): React.JSX.Element {
		const { href, children } = props
		return (
			<li {...styles.item()}>
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					{...styles.link()}
				>
					{children}
				</a>
			</li>
		)
	}

	export namespace Link {
		export type Props = {
			href: string
			children: React.ReactNode
		}
	}
}

namespace styles {
	export const footer = style({
		containerType: 'inline-size',
		paddingBottom: '48',
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
		margin: '0',
		padding: '0',
		typography: 'copy.14',
		userSelect: 'none',
		'@media (width >= 640px)': { gap: '24' },
	})

	export const item = style({ display: 'flex' })

	export const link = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'inline-flex',
		minHeight: '44',
		textDecorationLine: 'none',
		'@media (hover: hover)': { ':hover': { color: 'foreground' } },
		'@media (width >= 640px)': { minHeight: '32' },
	})

	export const themeToggle = style({
		display: 'flex',
		'@container (width >= 400px)': {
			left: '0',
			position: 'absolute',
			top: '50% !custom',
			translate: '0 -50% !custom',
		},
	})
}
