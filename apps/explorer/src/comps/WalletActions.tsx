import type { Address } from 'ox'
import { IconButton, TextButton, Tooltip, style } from '@tempoxyz/ds/platform'
import { LogOut } from '@tempoxyz/ds/platform/icons'
import * as React from 'react'
import {
	useConnect,
	useConnection,
	useConnectors,
	useDisconnect,
	useSwitchChain,
} from 'wagmi'
import { cx } from 'zyzz'
import { filterSupportedInjectedConnectors } from '#lib/wallets'
import { getTempoChain } from '#wagmi.config'
import { AddToWallet } from '#comps/AddToWallet'
import { InfoCard } from '#comps/InfoCard'
import { SetAsFeeToken } from '#comps/SetAsFeeToken'
import { animatePulse, pressDown } from '#styles/explorer'

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
			className={styles.card().className}
			title={
				<InfoCard.Title className={styles.title().className}>
					Wallet actions
					{isConnected && (
						<Tooltip content="Disconnect">
							<IconButton
								aria-label="Disconnect"
								onClick={() => disconnect.mutate({ connector })}
								scale="small"
								variant="tertiary"
								{...cx(styles.disconnect(), pressDown())}
							>
								<LogOut />
							</IconButton>
						</Tooltip>
					)}
				</InfoCard.Title>
			}
			sections={
				isReady
					? [
							<AddToWallet
								key="add"
								address={props.address}
								symbol={props.symbol}
								decimals={props.decimals}
								image={props.image}
							/>,
							<SetAsFeeToken
								key="fee"
								address={props.address}
								symbol={props.symbol}
							/>,
						]
					: [
							<TextButton
								key="connect"
								disabled={busy}
								onClick={handleConnectOrSwitch}
								{...cx(busy && animatePulse())}
							>
								{connectLabel}
							</TextButton>,
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
		image?: string | undefined
	}
}

namespace styles {
	// InfoCard fits its content from 1240px; the wallet card fills the column.
	export const card = style({
		'@media (width >= 1240px)': { width: '100% !custom' },
	})

	export const title = style({
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const disconnect = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})
}
