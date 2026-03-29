import type { Address } from 'ox'
import * as React from 'react'
import { type Connector, useConnection } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from '#lib/css'
import LucideCoins from '~icons/lucide/coins'

export function SetAsFeeToken(
	props: SetAsFeeToken.Props,
): React.JSX.Element | null {
	const { address: tokenAddress, symbol } = props
	const { address: account } = useConnection()
	const setFeeToken = Hooks.fee.useSetUserTokenSync()
	const userToken = Hooks.fee.useUserToken({ account })

	const [showSuccess, setShowSuccess] = React.useState(false)

	const isAlreadyFeeToken =
		setFeeToken.isSuccess ||
		userToken.data?.address?.toLowerCase() === tokenAddress.toLowerCase()

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset state when navigating to a different token
	React.useEffect(() => {
		setShowSuccess(false)
		setFeeToken.reset()
	}, [tokenAddress])

	React.useEffect(() => {
		if (!setFeeToken.isSuccess) return
		setShowSuccess(true)
	}, [setFeeToken.isSuccess])

	React.useEffect(() => {
		if (!showSuccess) return
		const timeout = setTimeout(() => setShowSuccess(false), 3_000)
		return () => clearTimeout(timeout)
	}, [showSuccess])

	const handleClick = () => {
		if (!account) return
		setFeeToken.mutate({ token: tokenAddress, account })
	}

	const busy = setFeeToken.isPending || showSuccess

	const label = showSuccess
		? 'Fee token set!'
		: isAlreadyFeeToken
			? 'Currently your fee token'
			: setFeeToken.isPending
				? 'Setting…'
				: `Set ${symbol ?? 'token'} as fee token`

	return (
		<button
			type="button"
			disabled={busy || isAlreadyFeeToken}
			className={cx(
				'flex items-center gap-2 w-full text-[13px] font-sans font-medium transition-colors',
				isAlreadyFeeToken
					? 'text-tertiary cursor-default'
					: showSuccess
						? 'text-positive'
						: busy
							? 'text-secondary animate-pulse'
							: 'text-secondary hover:text-primary cursor-pointer press-down',
			)}
			onClick={handleClick}
		>
			<LucideCoins className="size-3.5" />
			{label}
		</button>
	)
}

export declare namespace SetAsFeeToken {
	type Props = {
		address: Address.Address
		connectors: readonly Connector[]
		symbol?: string | undefined
	}
}
