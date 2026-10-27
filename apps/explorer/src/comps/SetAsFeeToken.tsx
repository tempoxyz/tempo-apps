import type { Address } from 'ox'
import { Button, Tag } from '@tempoxyz/ds'
import * as React from 'react'
import { useConnection } from 'wagmi'
import { Hooks } from 'wagmi/tempo'

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
				{showSuccess ? 'Fee token set' : 'Your fee token'}
			</Tag>
		)

	return (
		<Button
			loading={setFeeToken.isPending}
			onClick={handleClick}
			size="small"
			variant="secondary"
		>
			Set {symbol ?? 'token'} as fee token
		</Button>
	)
}

export declare namespace SetAsFeeToken {
	type Props = {
		address: Address.Address
		symbol?: string | undefined
	}
}
