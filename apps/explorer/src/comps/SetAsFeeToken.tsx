import type { Address } from 'ox'
import * as React from 'react'
import {
	type Connector,
	useConnection,
	useWaitForTransactionReceipt,
} from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from '#lib/css'
import LucideCoins from '~icons/lucide/coins'

export function SetAsFeeToken(
	props: SetAsFeeToken.Props,
): React.JSX.Element | null {
	const { address: tokenAddress, symbol } = props
	const { address: account } = useConnection()
	const setFeeToken = Hooks.fee.useSetUserToken()
	const userToken = Hooks.fee.useUserToken({ account })

	const [showSuccess, setShowSuccess] = React.useState(false)

	const receipt = useWaitForTransactionReceipt({
		hash: setFeeToken.data,
	})

	const isConfirmed = receipt.data?.status === 'success'

	const isAlreadyFeeToken =
		isConfirmed ||
		userToken.data?.address?.toLowerCase() === tokenAddress.toLowerCase()

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset state when navigating to a different token
	React.useEffect(() => {
		setShowSuccess(false)
		setFeeToken.reset()
	}, [tokenAddress])

	React.useEffect(() => {
		if (!isConfirmed) return
		setShowSuccess(true)
	}, [isConfirmed])

	React.useEffect(() => {
		if (!showSuccess) return
		const timeout = setTimeout(() => setShowSuccess(false), 3_000)
		return () => clearTimeout(timeout)
	}, [showSuccess])

	const handleClick = () => {
		if (!account) return
		setFeeToken.mutate({ token: tokenAddress, account })
	}

	const isWaitingForReceipt = setFeeToken.isSuccess && receipt.isPending

	const busy = setFeeToken.isPending || isWaitingForReceipt || showSuccess

	const label = showSuccess
		? 'Fee token set!'
		: isAlreadyFeeToken
			? 'Currently your fee token'
			: isWaitingForReceipt
				? 'Confirming…'
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
