import { ClientOnly } from '@tanstack/react-router'
import type { Address } from 'ox'
import * as React from 'react'
import { useConnect, useConnection, useConnectors, useWatchAsset } from 'wagmi'
import { cx } from '#lib/css'
import {
	filterSupportedInjectedConnectors,
	supportsWatchAsset,
} from '#lib/wallets'
import { getTempoChain } from '#wagmi.config'
import LucideWallet from '~icons/lucide/wallet'

const TEMPO_CHAIN_ID = getTempoChain().id

export function AddToWallet(props: AddToWallet.Props): React.JSX.Element {
	return (
		<ClientOnly fallback={null}>
			<AddToWalletInner {...props} />
		</ClientOnly>
	)
}

function AddToWalletInner(props: AddToWallet.Props): React.JSX.Element | null {
	const { address, symbol, decimals, image } = props
	const { address: walletAddress, connector, chain } = useConnection()
	const connectors = useConnectors()
	const connect = useConnect()

	const hasMetadata =
		typeof symbol === 'string' &&
		symbol.length > 0 &&
		Number.isInteger(decimals) &&
		(decimals as number) >= 0

	const injectedConnectors = React.useMemo(
		() => filterSupportedInjectedConnectors(connectors),
		[connectors],
	)
	const hasWallet = injectedConnectors.length > 0
	const isConnected = !!walletAddress
	const isOnTempoChain = chain?.id === TEMPO_CHAIN_ID
	const canWatchAsset =
		isConnected && supportsWatchAsset(connector) && isOnTempoChain

	const { watchAsset, isPending, isSuccess, reset } = useWatchAsset()

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset state when navigating to a different token
	React.useEffect(() => {
		reset()
	}, [address, reset])

	if (!hasMetadata || !hasWallet) return null

	// Not connected: show button that triggers wallet connection
	if (!isConnected) {
		const primaryConnector = injectedConnectors[0]

		return (
			<button
				type="button"
				disabled={connect.isPending}
				className={cx(
					'flex items-center gap-[6px] text-[12px] cursor-pointer press-down whitespace-nowrap',
					connect.isPending
						? 'text-secondary animate-pulse'
						: 'text-secondary hover:text-primary',
				)}
				onClick={() => {
					if (primaryConnector) {
						connect.mutate({ connector: primaryConnector })
					}
				}}
			>
				<LucideWallet className="size-[12px]" />
				{connect.isPending
					? 'Connecting…'
					: `Add to ${primaryConnector?.name ?? 'Wallet'}`}
			</button>
		)
	}

	// Connected but wrong chain or unsupported connector
	if (!canWatchAsset) return null

	return (
		<button
			type="button"
			disabled={isPending || isSuccess}
			className={cx(
				'flex items-center gap-[6px] text-[12px] cursor-pointer press-down whitespace-nowrap',
				isSuccess
					? 'text-positive'
					: isPending
						? 'text-secondary animate-pulse'
						: 'text-secondary hover:text-primary',
				(isPending || isSuccess) && 'pointer-events-none',
			)}
			onClick={() =>
				watchAsset({
					type: 'ERC20',
					options: {
						address,
						symbol: symbol as string,
						decimals: decimals as number,
						image,
					},
				})
			}
		>
			<LucideWallet className="size-[12px]" />
			{isSuccess
				? 'Added!'
				: isPending
					? 'Adding…'
					: `Add to ${connector?.name ?? 'Wallet'}`}
		</button>
	)
}

export declare namespace AddToWallet {
	type Props = {
		address: Address.Address
		symbol?: string | undefined
		decimals?: number | undefined
		image?: string | undefined
	}
}
