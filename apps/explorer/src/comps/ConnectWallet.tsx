import { ClientOnly } from '@tanstack/react-router'
import type { VariantProps } from 'cva'
import * as React from 'react'
import {
	useChains,
	useConnect,
	useConnection,
	useConnectors,
	useDisconnect,
	useSwitchChain,
} from 'wagmi'
import { Address } from '#comps/Address'
import { cva, cx } from '#cva.config.ts'
import { filterSupportedInjectedConnectors } from '#lib/wallets.ts'
import LucideLogOut from '~icons/lucide/log-out'
import LucideWalletCards from '~icons/lucide/wallet-cards'

export function ConnectWallet({
	showAddChain = true,
}: {
	showAddChain?: boolean
}) {
	return (
		<ClientOnly
			fallback={
				<div className="text-[12px] flex items-center text-secondary whitespace-nowrap">
					Detecting wallet…
				</div>
			}
		>
			<ConnectWalletInner showAddChain={showAddChain} />
		</ClientOnly>
	)
}

function ConnectWalletInner({
	showAddChain = true,
}: {
	showAddChain?: boolean
}) {
	const { address, chain, connector } = useConnection()
	const connect = useConnect()
	const [pendingId, setPendingId] = React.useState<string | null>(null)
	const connectors = useConnectors()
	const injectedConnectors = React.useMemo(
		() => filterSupportedInjectedConnectors(connectors),
		[connectors],
	)
	const switchChain = useSwitchChain()
	const chains = useChains()
	const isSupported = chains.some((c) => c.id === chain?.id)

	if (!injectedConnectors.length)
		return (
			<div className="text-[12px] -tracking-[2%] flex items-center whitespace-nowrap select-none">
				No wallet found.
			</div>
		)
	if (!address || connector?.id === 'webAuthn')
		return (
			<div className="flex items-center gap-1.5">
				<span className="text-[12px] text-tertiary whitespace-nowrap font-sans">
					Connect
				</span>
				{injectedConnectors.map((connector) => (
					<button
						type="button"
						key={connector.id}
						onClick={() => {
							setPendingId(connector.id)
							connect.mutate(
								{ connector },
								{
									onSettled: () => setPendingId(null),
								},
							)
						}}
						className={cx(
							'flex gap-[8px] items-center text-[12px] bg-base-alt rounded text-primary py-[6px] px-[10px] cursor-pointer press-down border border-card-border transition-colors',
							'hover:bg-base-alt/80',
							pendingId === connector.id &&
								connect.isPending &&
								'animate-pulse',
						)}
					>
						{connector.icon ? (
							<img
								className="size-[12px]"
								src={connector.icon}
								alt={connector.name}
							/>
						) : (
							<LucideWalletCards className="size-[12px]" />
						)}
						{connector.name}
					</button>
				))}
			</div>
		)
	return (
		<div className="flex items-stretch gap-2 justify-end">
			<ConnectedAddress />
			{showAddChain && !isSupported && (
				<Button
					className="w-fit"
					variant="accent"
					onClick={() =>
						switchChain.mutate({
							chainId: chains[0].id,
							addEthereumChainParameter: {
								blockExplorerUrls: ['https://explore.tempo.xyz'],
								nativeCurrency: { name: 'USD', decimals: 18, symbol: 'USD' },
							},
						})
					}
				>
					Add Tempo to {connector?.name ?? 'Wallet'}
				</Button>
			)}
			{switchChain.isSuccess && (
				<span className="text-[12px] font-normal text-tertiary whitespace-nowrap">
					Added Tempo to {connector?.name ?? 'Wallet'}!
				</span>
			)}
			<SignOut />
		</div>
	)
}

function ConnectedAddress() {
	const { address } = useConnection()

	if (!address) return null

	return (
		<div className="text-[12px] text-secondary whitespace-nowrap flex items-center gap-[4px]">
			<span className="hidden sm:inline">Connected as</span>
			<Address address={address} align="end" />
		</div>
	)
}

function SignOut() {
	const disconnect = useDisconnect()
	const { connector } = useConnection()

	return (
		<button
			type="button"
			title="Disconnect"
			className="h-full text-secondary hover:text-primary cursor-pointer press-down"
			onClick={() => disconnect.mutate({ connector })}
		>
			<LucideLogOut className="size-[12px] translate-y-px" />
		</button>
	)
}

export function Button(
	props: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> &
		VariantProps<typeof buttonClassName> & {
			render?: React.ReactElement
		},
) {
	const {
		className,
		disabled,
		render,
		static: static_,
		variant,
		...rest
	} = props
	const Element = render
		? (p: typeof props) => React.cloneElement(render, p)
		: 'button'
	return (
		<Element
			className={buttonClassName({
				className,
				disabled,
				static: static_,
				variant,
			})}
			{...rest}
		/>
	)
}

const buttonClassName = cva({
	base: 'inline-flex gap-[6px] items-center whitespace-nowrap font-medium focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer press-down text-[12px] hover:underline',
	defaultVariants: {
		variant: 'default',
	},
	variants: {
		disabled: {
			true: 'pointer-events-none opacity-50',
		},
		static: {
			true: 'pointer-events-none',
		},
		variant: {
			accent: 'text-accent',
			default: 'text-secondary',
			destructive: 'text-negative',
		},
	},
})
