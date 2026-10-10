import type { Address } from 'ox'
import { IconButton, style, variants } from '@tempoxyz/ds/platform'
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
import { pressDown, pulse, transitionColors } from '#styles/explorer'
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
	const actionState = busy ? 'busy' : 'idle'

	return (
		<InfoCard
			className={styles.card().className}
			title={
				<InfoCard.Title className={styles.title().className}>
					Wallet actions
					{isConnected && (
						<IconButton
							aria-label="Disconnect"
							onClick={() => disconnect.mutate({ connector })}
							scale="small"
							title="Disconnect"
							variant="tertiary"
							{...cx(styles.disconnect(), pressDown())}
						>
							<LucideLogOut />
						</IconButton>
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
								image={props.image}
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
								{...cx(
									styles.action({ state: actionState }),
									transitionColors(),
									!busy && pressDown(),
								)}
								onClick={handleConnectOrSwitch}
							>
								<LucideWallet {...styles.actionIcon()} />
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
		image?: string | undefined
	}
}

namespace styles {
	// InfoCard fits its content from 1240px; the wallet card fills the column.
	export const card = style({
		'@media (width >= 1240px)': { width: '100% !custom !important' },
	})

	export const title = style({
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	// TDS IconButton owns size, color, radius, and focus ring.
	export const disconnect = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const action = variants({
		base: {
			alignItems: 'center',
			display: 'flex',
			gap: '8',
			typography: 'body.b3',
			width: '100% !custom',
		},
		defaultVariants: { state: 'idle' },
		variants: {
			state: {
				busy: {
					animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
					color: 'content.secondary',
				},
				current: { color: 'content.tertiary', cursor: 'default' },
				idle: {
					color: 'content.secondary',
					cursor: 'pointer',
					'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
				},
				success: { color: 'content.positive' },
			},
		},
	})

	export const actionIcon = style({
		flexShrink: 0,
		height: '14px !custom',
		width: '14px !custom',
	})
}
