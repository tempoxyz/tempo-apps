import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from '@tanstack/react-router'
import * as React from 'react'
import SunIcon from '~icons/lucide/sun'
import MoonIcon from '~icons/lucide/moon'
import css from './styles.css?url'

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient
}>()({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{ title: 'Perf — Tempo' },
			{
				name: 'description',
				content:
					'Tempo blockchain performance dashboard. Throughput and latency benchmarks under various load conditions.',
			},
		],
		links: [
			{
				rel: 'preload',
				href: '/fonts/satoshi/Satoshi-Variable.woff2',
				as: 'font',
				type: 'font/woff2',
				crossOrigin: 'anonymous',
			},
			{
				rel: 'preload',
				href: '/fonts/geist-mono/GeistMono-Variable.woff2',
				as: 'font',
				type: 'font/woff2',
				crossOrigin: 'anonymous',
			},
			{ rel: 'stylesheet', href: css },
		],
	}),
	scripts: () => [
		{
			children: `(function(){var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.style.colorScheme=t}})()`,
			type: 'text/javascript',
		},
	],
	component: RootDocument,
})

function RootDocument() {
	const { queryClient } = Route.useRouteContext()
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					<div className="mx-auto min-h-dvh max-w-[1200px] px-6 lg:px-[84px]">
						<Banner />
						<Header />
						<main>
							<Outlet />
						</main>
						<Footer />
					</div>
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	)
}

function Banner(): React.JSX.Element {
	return (
		<div className="mt-4 rounded-lg border border-negative/40 bg-negative/10 px-4 py-2.5 text-center text-[13px] font-medium text-negative">
			🚧 Under development — all data shown is mock data
		</div>
	)
}

function Header(): React.JSX.Element {
	return (
		<header className="flex items-center justify-between py-8">
			<Link to="/">
				<TempoWordmark />
			</Link>
			<div className="flex items-center gap-2">
				<nav className="flex items-center gap-1 text-[14px] font-medium leading-[140%]">
					<NavLink to="/" exact>
						Dashboard
					</NavLink>
					<NavLink to="/methodology">Methodology</NavLink>
				</nav>
				<div className="mx-2 h-5 w-px bg-border" />
				<ThemeToggle />
			</div>
		</header>
	)
}

function Footer(): React.JSX.Element {
	return (
		<footer className="py-8 text-center">
			<ul className="flex items-center justify-center gap-6 text-[14px] font-medium text-secondary select-none">
				<li>
					<a
						href="https://tempo.xyz"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-primary"
					>
						About
					</a>
				</li>
				<li>
					<a
						href="https://docs.tempo.xyz"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-primary"
					>
						Docs
					</a>
				</li>
				<li>
					<a
						href="https://github.com/tempoxyz"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-primary"
					>
						GitHub
					</a>
				</li>
			</ul>
		</footer>
	)
}

function NavLink(props: {
	to: string
	exact?: boolean
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<Link
			to={props.to}
			className="rounded-lg px-3 py-1.5 text-secondary transition-colors hover:text-primary"
			activeProps={{
				className: 'rounded-lg px-3 py-1.5 bg-accent-muted text-accent',
			}}
			activeOptions={props.exact ? { exact: true } : undefined}
		>
			{props.children}
		</Link>
	)
}

function ThemeToggle(): React.JSX.Element {
	const [theme, setTheme] = React.useState<'light' | 'dark'>('dark')

	React.useEffect(() => {
		const stored = localStorage.getItem('theme')
		if (stored === 'light' || stored === 'dark') {
			setTheme(stored)
		} else {
			const prefersDark = window.matchMedia(
				'(prefers-color-scheme: dark)',
			).matches
			setTheme(prefersDark ? 'dark' : 'light')
		}
	}, [])

	function toggle() {
		const next = theme === 'dark' ? 'light' : 'dark'
		setTheme(next)
		localStorage.setItem('theme', next)
		document.documentElement.style.colorScheme = next
	}

	return (
		<button
			type="button"
			onClick={toggle}
			className="rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
			aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
		>
			{theme === 'dark' ? (
				<SunIcon className="size-4" />
			) : (
				<MoonIcon className="size-4" />
			)}
		</button>
	)
}

function TempoWordmark(): React.JSX.Element {
	return (
		<svg
			aria-label="Tempo"
			viewBox="0 0 107 25"
			className="h-[22px] w-auto fill-current text-primary"
			role="img"
		>
			<path d="M8.10464 23.7163H1.82475L7.64513 5.79356H0.201172L1.82475 0.540352H22.5637L20.9401 5.79356H13.8944L8.10464 23.7163Z" />
			<path d="M31.474 23.7163H16.5861L24.0607 0.540352H38.8873L37.4782 4.95923H28.8701L27.3078 9.93433H35.6402L34.231 14.2914H25.8681L24.3057 19.2974H32.8525L31.474 23.7163Z" />
			<path d="M38.2124 23.7163H33.2192L40.7244 0.540352H49.0567L48.781 13.0245L56.8989 0.540352H66.0277L58.5531 23.7163H52.3039L57.3584 7.86395L46.9736 23.7163H43.267L43.4201 7.80214L38.2124 23.7163Z" />
			<path d="M73.057 4.83563L70.6369 12.3137H71.3108C72.8425 12.3137 74.1189 11.9532 75.14 11.2322C76.1612 10.4906 76.8249 9.43991 77.1312 8.08025C77.3967 6.90601 77.2538 6.07167 76.7023 5.57725C76.1509 5.08284 75.2319 4.83563 73.9453 4.83563H73.057ZM66.9915 23.7163H60.7116L68.1862 0.540352H75.814C77.5703 0.540352 79.0816 0.828764 80.3478 1.40559C81.6344 1.96181 82.5738 2.76524 83.166 3.81588C83.7787 4.84592 83.9829 6.05107 83.7787 7.43133C83.5132 9.2442 82.8189 10.8408 81.6956 12.221C80.5724 13.6013 79.1122 14.6725 77.315 15.4347C75.5383 16.1764 73.5471 16.5472 71.3415 16.5472H69.289L66.9915 23.7163Z" />
			<path d="M98.747 22.233C96.664 23.4691 94.4481 24.0871 92.0996 24.0871H92.0383C89.9552 24.0871 88.1989 23.6236 86.7693 22.6965C85.3602 21.7489 84.3493 20.4717 83.7366 18.8648C83.1443 17.2579 83.0014 15.4966 83.3077 13.5807C83.6957 11.1704 84.5841 8.94549 85.9728 6.90601C87.3616 4.86653 89.0975 3.23906 91.1805 2.02361C93.2636 0.808164 95.4897 0.200439 97.8587 0.200439H97.9199C100.085 0.200439 101.872 0.663958 103.281 1.591C104.71 2.51803 105.701 3.78498 106.252 5.39185C106.824 6.97811 106.947 8.76008 106.62 10.7378C106.232 13.0657 105.343 15.2596 103.955 17.3197C102.566 19.3592 100.83 20.997 98.747 22.233ZM90.0777 18.2468C90.6292 19.2974 91.589 19.8227 92.9573 19.8227H93.0186C94.1418 19.8227 95.1833 19.4004 96.1432 18.5558C97.1235 17.6905 97.9506 16.5369 98.6245 15.0948C99.3189 13.6528 99.8294 12.0459 100.156 10.2742C100.463 8.54377 100.34 7.15322 99.7886 6.10257C99.2372 5.03133 98.2875 4.49571 96.9397 4.49571H96.8784C95.8369 4.49571 94.826 4.92833 93.8457 5.79356C92.8858 6.6588 92.0485 7.82274 91.3337 9.2854C90.6189 10.7481 90.0982 12.3343 89.7714 14.0442C89.4446 15.7747 89.5468 17.1755 90.0777 18.2468Z" />
		</svg>
	)
}
