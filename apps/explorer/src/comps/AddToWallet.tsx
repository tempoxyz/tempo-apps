import type { Address } from 'ox'
import * as React from 'react'
import {
	type Connector,
	useConnect,
	useConnection,
	useSwitchChain,
	useWatchAsset,
} from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from '#lib/css'
import { supportsWatchAsset } from '#lib/wallets'
import { getTempoChain } from '#wagmi.config'
import LucideWallet from '~icons/lucide/wallet'

const TEMPO_CHAIN_ID = getTempoChain().id

function getWalletName(
	connector: { name?: string; id?: string } | undefined | null,
): string | undefined {
	if (!connector) return undefined
	if (connector.name && connector.name !== 'Injected') return connector.name
	return undefined
}

export function AddToWallet(
	props: AddToWallet.Props,
): React.JSX.Element | null {
	const { address, symbol: symbolProp, decimals: decimalsProp, image, connectors } = props
	const { address: walletAddress, connector, chain } = useConnection()
	const connect = useConnect()
	const switchChain = useSwitchChain()

	const { data: onChainMetadata } = Hooks.token.useGetMetadata({
		token: address,
		query: { enabled: symbolProp === undefined || decimalsProp === undefined },
	})

	const symbol = symbolProp ?? onChainMetadata?.symbol
	const decimals = decimalsProp ?? onChainMetadata?.decimals

	const hasMetadata =
		typeof symbol === 'string' &&
		symbol.length > 0 &&
		Number.isInteger(decimals) &&
		(decimals as number) >= 0

	const isConnected = !!walletAddress
	const isOnTempoChain = chain?.id === TEMPO_CHAIN_ID
	const isSupportedConnector = supportsWatchAsset(connector)

	const { watchAsset, isPending, isSuccess, reset } = useWatchAsset()

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset state when navigating to a different token
	React.useEffect(() => {
		reset()
	}, [address, reset])

	React.useEffect(() => {
		if (!isSuccess) return
		const timeout = setTimeout(() => reset(), 3_000)
		return () => clearTimeout(timeout)
	}, [isSuccess, reset])

	const addToWallet = React.useCallback(() => {
		if (!hasMetadata) return
		watchAsset({
			type: 'ERC20',
			options: {
				address,
				symbol: symbol as string,
				decimals: decimals as number,
				image,
			},
		})
	}, [watchAsset, address, symbol, decimals, image, hasMetadata])

	const handleClick = () => {
		if (!isConnected) {
			const primaryConnector = connectors[0]
			if (primaryConnector) {
				connect.mutate({ connector: primaryConnector })
			}
			return
		}

		if (!isOnTempoChain && isSupportedConnector) {
			switchChain.mutate({
				chainId: TEMPO_CHAIN_ID,
				addEthereumChainParameter: {
					nativeCurrency: { name: 'USD', decimals: 18, symbol: 'USD' },
				},
			})
			return
		}

		addToWallet()
	}

	const walletName =
		getWalletName(connector) ??
		getWalletName(connectors[0]) ??
		'Wallet'

	const busy =
		connect.isPending || switchChain.isPending || isPending || isSuccess

	const needsChainSwitch =
		isConnected && isSupportedConnector && !isOnTempoChain

	const label = isSuccess
		? 'Added!'
		: isPending
			? 'Adding…'
			: switchChain.isPending
				? 'Switching network…'
				: connect.isPending
					? 'Connecting…'
					: needsChainSwitch
						? 'Switch to Tempo'
						: isConnected
							? `Add ${symbol ?? 'token'} to ${walletName}`
							: `Connect ${walletName}`

	if (isConnected && !isSupportedConnector) return null

	return (
		<button
			type="button"
			disabled={busy}
			className={cx(
				'flex items-center justify-center gap-2 w-full rounded-lg border px-3 py-2 text-[13px] font-sans font-medium cursor-pointer press-down transition-colors',
				isSuccess
					? 'border-positive/30 text-positive bg-positive/5'
					: busy
						? 'border-base-border text-secondary bg-base-plane animate-pulse'
						: 'border-base-border text-secondary bg-base-plane hover:bg-base-plane-interactive hover:text-primary',
			)}
			onClick={handleClick}
		>
			<LucideWallet className="size-3.5" />
			{label}
		</button>
	)
}

export declare namespace AddToWallet {
	type Props = {
		address: Address.Address
		connectors: readonly Connector[]
		symbol?: string | undefined
		decimals?: number | undefined
		image?: string | undefined
	}
}
