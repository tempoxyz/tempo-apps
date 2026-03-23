import { ClientOnly } from '@tanstack/react-router'
import type { Address } from 'ox'
import * as React from 'react'
import { useConnection, useWatchAsset } from 'wagmi'
import { cx } from '#lib/css'
import { supportsWatchAsset } from '#lib/wallets'
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

	const hasMetadata =
		typeof symbol === 'string' &&
		symbol.length > 0 &&
		Number.isInteger(decimals) &&
		(decimals as number) >= 0

	const canAdd =
		!!walletAddress &&
		supportsWatchAsset(connector) &&
		chain?.id === TEMPO_CHAIN_ID &&
		hasMetadata

	const { watchAsset, isPending, isSuccess, reset } = useWatchAsset()

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset state when navigating to a different token
	React.useEffect(() => {
		reset()
	}, [address, reset])

	if (!canAdd) return null

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
