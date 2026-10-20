import type { Address } from 'ox'
import { Tag } from '@tempoxyz/ds'
import { ChevronRight } from '@tempoxyz/ds/icons'
import * as React from 'react'
import { useConnection } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from 'zyzz'
import { animatePulse, textAction } from '#styles/explorer'

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

	if (isAlreadyFeeToken)
		return (
			<Tag intent="positive" variant="plain">
				<Tag.Dot />
				{showSuccess ? 'Fee token set!' : 'Currently your fee token'}
			</Tag>
		)

	return (
		<button
			disabled={setFeeToken.isPending}
			onClick={handleClick}
			type="button"
			{...cx(textAction(), setFeeToken.isPending && animatePulse())}
		>
			{setFeeToken.isPending
				? 'Setting…'
				: `Set ${symbol ?? 'token'} as fee token`}
			<ChevronRight />
		</button>
	)
}

export declare namespace SetAsFeeToken {
	type Props = {
		address: Address.Address
		symbol?: string | undefined
	}
}
