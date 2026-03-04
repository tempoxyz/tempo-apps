import { cx } from '#lib/css'

const networks = [
	{ label: 'Testnet', href: 'https://explore.testnet.tempo.xyz' },
	{ label: 'Mainnet', href: 'https://explore.mainnet.tempo.xyz' },
] as const

export function NetworkToggle(props: NetworkToggle.Props): React.JSX.Element {
	const { className } = props
	const isMainnet =
		typeof window !== 'undefined' &&
		window.location.hostname === 'explore.mainnet.tempo.xyz'
	const activeIndex = isMainnet ? 1 : 0

	return (
		<div
			className={cx(
				'flex items-center rounded-full border border-base-border bg-surface text-[11px] font-medium',
				className,
			)}
		>
			{networks.map((network, i) => {
				const isActive = i === activeIndex
				return (
					<a
						key={network.label}
						href={network.href}
						className={cx(
							'px-2 py-0.5 rounded-full press-down transition-colors duration-150',
							isActive
								? 'bg-base-content text-content-inverse'
								: 'text-secondary hover:text-primary',
						)}
					>
						{network.label}
					</a>
				)
			})}
		</div>
	)
}

export declare namespace NetworkToggle {
	type Props = {
		className?: string | undefined
	}
}
