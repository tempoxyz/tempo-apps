import type { Address } from 'ox'
import { style, variants } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { type Connector, useConnection } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from 'zyzz'
import { pressDown, pulse, transitionColors } from '#styles/explorer'
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

	const state = isAlreadyFeeToken
		? 'current'
		: showSuccess
			? 'success'
			: busy
				? 'busy'
				: 'idle'

	return (
		<button
			type="button"
			disabled={busy || isAlreadyFeeToken}
			{...cx(
				styles.action({ state }),
				transitionColors(),
				state === 'idle' && pressDown(),
			)}
			onClick={handleClick}
		>
			<LucideCoins {...styles.icon()} />
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

namespace styles {
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

	export const icon = style({
		flexShrink: 0,
		height: '14px !custom',
		width: '14px !custom',
	})
}
