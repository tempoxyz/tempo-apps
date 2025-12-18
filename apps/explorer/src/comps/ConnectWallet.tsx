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
import { cva } from '#cva.config.ts'
import { HexFormatter } from '#lib/formatting.ts'
import { useCopy } from '#lib/hooks.ts'
import { filterSupportedInjectedConnectors } from '#lib/wallets.ts'
import LucideCheck from '~icons/lucide/check'
import LucideWalletCards from '~icons/lucide/wallet-cards'

export function ConnectWallet({
	showAddChain = true,
}: {
	showAddChain?: boolean
}) {
	return (
		<ClientOnly
			fallback={
				<div className="text-[14px] -tracking-[2%] flex items-center">
					Detecting wallets…
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
			<div className="text-[14px] -tracking-[2%] flex items-center">
				No browser wallets found.
			</div>
		)
	if (!address || connector?.id === 'webAuthn')
		return (
			<div className="flex gap-2">
				{injectedConnectors.map((connector) => (
					<Button
						variant="default"
						className="flex gap-1.5 items-center"
						key={connector.id}
						onClick={() => connect.mutate({ connector })}
					>
						{connector.icon ? (
							<img
								className="size-5"
								src={connector.icon}
								alt={connector.name}
							/>
						) : (
							<div />
						)}
						{connector.name}
					</Button>
				))}
			</div>
		)
	return (
		<div className="flex flex-col gap-2">
			<Logout />
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
				<div className="text-[14px] -tracking-[2%] font-normal flex items-center">
					Added Tempo to {connector?.name ?? 'Wallet'}!
				</div>
			)}
		</div>
	)
}

export function Logout() {
	const disconnect = useDisconnect()
	const { address, connector } = useConnection()

	const { copy, notifying } = useCopy({ timeout: 2_000 })

	if (!address) return null

	return (
		<div className="flex items-center gap-1">
			<Button
				onClick={(event) => {
					event.preventDefault()
					event.stopPropagation()
					void copy(address)
				}}
				variant="default"
			>
				{notifying ? (
					<LucideCheck className="text-gray9 mt-px" />
				) : (
					<LucideWalletCards className="text-gray9 mt-px" />
				)}
				{HexFormatter.truncate(address, 6)}
			</Button>
			<Button
				type="button"
				variant="destructive"
				onClick={() => disconnect.mutate({ connector })}
				className="text-[14px] -tracking-[2%] font-normal"
			>
				Sign out
			</Button>
		</div>
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
		size,
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
				size,
				static: static_,
				variant,
			})}
			{...rest}
		/>
	)
}

const buttonClassName = cva({
	base: 'relative inline-flex gap-2 items-center justify-center whitespace-nowrap rounded-md font-normal transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
	defaultVariants: {
		size: 'default',
		variant: 'default',
	},
	variants: {
		disabled: {
			true: 'pointer-events-none opacity-50',
		},
		size: {
			default: 'text-[14px] -tracking-[2%] h-[32px] px-[14px]',
		},
		static: {
			true: 'pointer-events-none',
		},
		variant: {
			accent:
				'bg-(--vocs-color_inverted) text-(--vocs-color_background) border dark:border-dashed',
			default:
				'text-(--vocs-color_inverted) bg-(--vocs-color_background) border border-dashed',
			destructive:
				'bg-(--vocs-color_backgroundRedTint2) text-(--vocs-color_textRed) border border-dashed',
		},
	},
})
