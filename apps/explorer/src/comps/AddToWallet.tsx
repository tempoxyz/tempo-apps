import type { Address } from 'ox'
import * as React from 'react'
import { type Connector, useConnection, useWatchAsset } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from '#lib/css'
import { supportsWatchAsset } from '#lib/wallets'
import LucideWallet from '~icons/lucide/wallet'

export function AddToWallet(
	props: AddToWallet.Props,
): React.JSX.Element | null {
	const { address, symbol: symbolProp, decimals: decimalsProp, image } = props
	const { connector } = useConnection()

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

	const handleClick = () => {
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
	}

	if (!isSupportedConnector) return null

	const walletName =
		connector?.name && connector.name !== 'Injected' ? connector.name : 'Wallet'

	const label = isSuccess
		? 'Added!'
		: isPending
			? 'Adding…'
			: `Add ${symbol ?? 'token'} to ${walletName}`

	return (
		<button
			type="button"
			disabled={isPending || isSuccess}
			className={cx(
				'flex items-center gap-2 w-full text-[13px] font-sans font-medium transition-colors',
				isSuccess
					? 'text-positive'
					: isPending
						? 'text-secondary animate-pulse'
						: 'text-secondary hover:text-primary cursor-pointer press-down',
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
