import type { Address } from 'ox'
import { Button, Tag } from '@tempoxyz/ds'
import * as React from 'react'
import { useConnection, useWatchAsset } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { supportsWatchAsset } from '#lib/wallets'

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
		connector?.name && connector.name !== 'Injected' ? connector.name : 'wallet'

	if (isSuccess)
		return (
			<Tag intent="positive" variant="plain">
				<Tag.Dot />
				Added to {walletName}
			</Tag>
		)

	return (
		<Button
			loading={isPending}
			onClick={handleClick}
			size="small"
			variant="secondary"
		>
			Add {symbol ?? 'token'} to {walletName}
		</Button>
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
