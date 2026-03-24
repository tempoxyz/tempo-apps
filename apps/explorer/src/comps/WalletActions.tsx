import type { Address } from 'ox'
import * as React from 'react'
import {
	useConnect,
	useConnection,
	useConnectors,
	useDisconnect,
	useSwitchChain,
} from 'wagmi'
import { cx } from '#lib/css'
import { filterSupportedInjectedConnectors } from '#lib/wallets'
import { getTempoChain } from '#wagmi.config'
import { AddToWallet } from '#comps/AddToWallet'
import { InfoCard } from '#comps/InfoCard'
import { SetAsFeeToken } from '#comps/SetAsFeeToken'
import LucideLogOut from '~icons/lucide/log-out'
import LucideWallet from '~icons/lucide/wallet'

const TEMPO_CHAIN_ID = getTempoChain().id

export function WalletActions(
	props: WalletActions.Props,
): React.JSX.Element | null {
	const connectors = useConnectors()
	const supported = React.useMemo(
		() => filterSupportedInjectedConnectors(connectors),
		[connectors],
	)
	const { address: account, connector, chain } = useConnection()
	const connect = useConnect()
	const disconnect = useDisconnect()
	const switchChain = useSwitchChain()

	if (supported.length === 0) return null

	const isConnected = !!account
	const isOnTempoChain = chain?.id === TEMPO_CHAIN_ID
	const isReady = isConnected && isOnTempoChain

	const walletName =
		(connector?.name && connector.name !== 'Injected'
			? connector.name
			: undefined) ??
		(supported[0]?.name && supported[0].name !== 'Injected'
			? supported[0].name
			: undefined) ??
		'Wallet'

	const handleConnectOrSwitch = () => {
		if (!isConnected) {
			const primaryConnector = supported[0]
			if (primaryConnector) connect.mutate({ connector: primaryConnector })
			return
		}
		if (!isOnTempoChain) {
			switchChain.mutate({
				chainId: TEMPO_CHAIN_ID,
				addEthereumChainParameter: {
					nativeCurrency: { name: 'USD', decimals: 18, symbol: 'USD' },
				},
			})
		}
	}

	const busy = connect.isPending || switchChain.isPending
	const connectLabel = connect.isPending
		? 'Connecting…'
		: switchChain.isPending
			? 'Switching network…'
			: !isConnected
				? `Connect ${walletName}`
				: `Switch to Tempo`

	return (
		<InfoCard
			className="min-[1240px]:w-full"
			title={
				<InfoCard.Title className="w-full justify-between">
					Wallet actions
					{isConnected && (
						<button
							type="button"
							title="Disconnect"
							className="text-secondary hover:text-primary cursor-pointer press-down"
							onClick={() => disconnect.mutate({ connector })}
						>
							<LucideLogOut className="size-3" />
						</button>
					)}
				</InfoCard.Title>
			}
			sections={
				isReady
					? [
							<AddToWallet
								key="add"
								address={props.address}
								connectors={supported}
								symbol={props.symbol}
								decimals={props.decimals}
							/>,
							<SetAsFeeToken
								key="fee"
								address={props.address}
								connectors={supported}
								symbol={props.symbol}
							/>,
						]
					: [
							<button
								key="connect"
								type="button"
								disabled={busy}
								className={cx(
									'flex items-center gap-2 w-full text-[13px] font-sans font-medium transition-colors',
									busy
										? 'text-secondary animate-pulse'
										: 'text-secondary hover:text-primary cursor-pointer press-down',
								)}
								onClick={handleConnectOrSwitch}
							>
								<LucideWallet className="size-3.5" />
								{connectLabel}
							</button>,
						]
			}
		/>
	)
}

export declare namespace WalletActions {
	type Props = {
		address: Address.Address
		symbol?: string | undefined
		decimals?: number | undefined
	}
}
