import { useMutation } from '@tanstack/react-query'
import { ClientOnly } from '@tanstack/react-router'
import type { Address as OxAddress } from 'ox'
import * as React from 'react'
import {
	useChains,
	useConfig,
	useConnect,
	useConnection,
	useConnectors,
	useDisconnect,
	useSwitchChain,
	useWatchBlockNumber,
} from 'wagmi'
import { Actions, Hooks } from 'wagmi/tempo'
import { Address } from '#comps/Address'
import { cx } from '#cva.config'
import { ellipsis } from '#lib/chars'
import { filterSupportedInjectedConnectors } from '#lib/wallets'
import LucideDownload from '~icons/lucide/download'
import LucideLogOut from '~icons/lucide/log-out'
import LucideWalletCards from '~icons/lucide/wallet-cards'

// survive component remounts during WebAuthn flow
const passkeyStore = {
	error: null as Error | null,
	pending: false,
	listeners: new Set<() => void>(),
	subscribe(cb: () => void) {
		this.listeners.add(cb)
		return () => this.listeners.delete(cb)
	},
	notify() {
		for (const cb of this.listeners) cb()
	},
}

export function ConnectWallet(props: ConnectWallet.Props) {
	const { showAddChain = true } = props
	return (
		<ClientOnly
			fallback={
				<div className="text-[12px] flex items-center text-secondary">
					Detecting wallet{ellipsis}
				</div>
			}
		>
			<ConnectWallet.Content showAddChain={showAddChain} />
		</ClientOnly>
	)
}

export namespace ConnectWallet {
	export interface Props {
		showAddChain?: boolean
	}

	export function Passkey() {
		const config = useConfig()
		const error = React.useSyncExternalStore(
			(cb) => passkeyStore.subscribe(cb),
			() => passkeyStore.error,
			() => null,
		)
		const isPending = React.useSyncExternalStore(
			(cb) => passkeyStore.subscribe(cb),
			() => passkeyStore.pending,
			() => false,
		)

		const connect = useConnect({
			mutation: {
				onError: (err) => {
					passkeyStore.pending = false
					passkeyStore.error = err
					passkeyStore.notify()
				},
				onSuccess: () => {
					passkeyStore.pending = false
					passkeyStore.error = null
					passkeyStore.notify()
				},
			},
		})
		const connection = useConnection()
		const connectors = useConnectors()

		const connector = React.useMemo(
			() => connectors.find((connector) => connector.id === 'webAuthn'),
			[connectors],
		)

		const balance = Hooks.token.useGetBalance({
			account: connection.address,
			token: '0x20c0000000000000000000000000000000000001',
		})

		const fund = useMutation({
			mutationFn: async (account: OxAddress.Address) => {
				await Actions.faucet.fund(config, { account })
				await balance.refetch()
			},
		})

		const prevHasFunds = React.useRef<boolean | null>(null)
		const hasFunds = Boolean(balance.data && balance.data > 0n)
		React.useEffect(() => {
			if (prevHasFunds.current === true && !hasFunds) fund.reset()
			prevHasFunds.current = hasFunds
		}, [hasFunds, fund])

		useWatchBlockNumber({
			onBlockNumber: () => [balance.refetch()],
		})

		if (!connector || connector.id !== 'webAuthn')
			return (
				<span className="text-[12px] text-negative">no passkey connector</span>
			)

		if (isPending)
			return (
				<span className="text-[12px] text-secondary">Connecting{ellipsis}</span>
			)

		if (connection.isConnected && connection.address) {
			const showFundButton =
				!hasFunds && (fund.status === 'idle' || fund.status === 'pending')
			return (
				<div className="flex items-center gap-2">
					{showFundButton &&
						(fund.isPending ? (
							<span className="text-[12px] text-secondary">
								Funding{ellipsis}
							</span>
						) : (
							<button
								type="button"
								className="text-[12px] inline-flex items-center gap-1 text-positive hover:underline cursor-pointer press-down"
								// biome-ignore lint/style/noNonNullAssertion: is ok
								onClick={() => fund.mutate(connection.address!)}
							>
								Fund
								<LucideDownload className="size-[12px]" />
							</button>
						))}
					{fund.error && (
						<span className="text-[12px] text-negative">Fund failed</span>
					)}
					<Address
						chars={6}
						align="end"
						address={connection.address}
						className="text-accent text-[12px] hover:underline"
					/>
					<SignOut />
				</div>
			)
		}

		const handleSignIn = () => {
			passkeyStore.error = null
			passkeyStore.pending = true
			passkeyStore.notify()
			connect.mutate({ connector, capabilities: { type: 'sign-in' } })
		}

		const handleSignUp = () => {
			passkeyStore.error = null
			passkeyStore.pending = true
			passkeyStore.notify()
			connect.mutate({ connector, capabilities: { type: 'sign-up' } })
		}

		if (error)
			return (
				<div className="flex items-center gap-2 text-[12px] whitespace-nowrap">
					<span className="text-negative">Failed</span>
					<button
						type="button"
						className="text-accent hover:underline cursor-pointer press-down"
						onClick={() => {
							passkeyStore.error = null
							passkeyStore.notify()
						}}
					>
						Retry
					</button>
				</div>
			)

		return (
			<div className="flex items-center gap-2 text-[12px] text-tertiary whitespace-nowrap">
				<button
					type="button"
					className="cursor-pointer press-down text-[12px] hover:underline text-accent"
					onClick={handleSignIn}
				>
					Sign in
				</button>
				or
				<button
					type="button"
					className="cursor-pointer press-down text-[12px] hover:underline text-accent"
					onClick={handleSignUp}
				>
					Create account
				</button>
			</div>
		)
	}

	export function Content(props: Props) {
		const { showAddChain = true } = props
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
				<div className="text-[12px] flex items-center">No wallet found.</div>
			)

		if (!address || connector?.id === 'webAuthn')
			return (
				<div className="flex gap-2">
					{injectedConnectors.map((connector) => (
						<button
							type="button"
							key={connector.id}
							className="inline-flex gap-[8px] items-center whitespace-nowrap cursor-pointer press-down text-[12px] hover:underline text-secondary"
							onClick={() => connect.mutate({ connector })}
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
							Connect {connector.name}
						</button>
					))}
				</div>
			)
		return (
			<div className="flex items-stretch gap-2 justify-end">
				<ConnectedAddress />
				{showAddChain && !isSupported && (
					<button
						type="button"
						className={cx(
							'inline-flex gap-[6px] items-center whitespace-nowrap w-fit',
							'cursor-pointer press-down text-[12px] hover:underline text-accent',
						)}
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
					</button>
				)}
				{switchChain.isSuccess && (
					<span className="text-[12px] font-normal text-tertiary">
						Added Tempo to {connector?.name ?? 'Wallet'}!
					</span>
				)}
				<SignOut />
			</div>
		)
	}

	export function ConnectedAddress() {
		const { address } = useConnection()
		return (
			address && (
				<div className="text-[12px] text-secondary whitespace-nowrap flex items-center gap-[4px]">
					<span className="hidden sm:inline">Connected as</span>
					<Address address={address} align="end" />
				</div>
			)
		)
	}

	export function SignOut() {
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
}
