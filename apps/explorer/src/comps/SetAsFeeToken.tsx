import type { Address } from 'ox'
import * as React from 'react'
import {
	type Connector,
	useConnect,
	useConnection,
	useSwitchChain,
	useWaitForTransactionReceipt,
} from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from '#lib/css'
import { getTempoChain } from '#wagmi.config'
import LucideCoins from '~icons/lucide/coins'

const TEMPO_CHAIN_ID = getTempoChain().id

function getWalletName(
	connector: { name?: string; id?: string } | undefined | null,
): string | undefined {
	if (!connector) return undefined
	if (connector.name && connector.name !== 'Injected') return connector.name
	return undefined
}

export function SetAsFeeToken(
	props: SetAsFeeToken.Props,
): React.JSX.Element | null {
	const { address: tokenAddress, symbol, connectors } = props
	const { address: account, connector, chain } = useConnection()
	const connect = useConnect()
	const switchChain = useSwitchChain()
	const setFeeToken = Hooks.fee.useSetUserToken()
	const userToken = Hooks.fee.useUserToken({ account })

	const [showSuccess, setShowSuccess] = React.useState(false)

	const receipt = useWaitForTransactionReceipt({
		hash: setFeeToken.data,
	})

	const isConfirmed = receipt.data?.status === 'success'

	const isConnected = !!account
	const isOnTempoChain = chain?.id === TEMPO_CHAIN_ID
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
		if (!isConnected) {
			const primaryConnector = connectors[0]
			if (primaryConnector) {
				connect.mutate({ connector: primaryConnector })
			}
			return
		}

		if (!isOnTempoChain) {
			switchChain.mutate({
				chainId: TEMPO_CHAIN_ID,
				addEthereumChainParameter: {
					nativeCurrency: { name: 'USD', decimals: 18, symbol: 'USD' },
				},
			})
			return
		}

		if (!account) return
		setFeeToken.mutate({ token: tokenAddress, account })
	}

	const walletName =
		getWalletName(connector) ??
		getWalletName(connectors[0]) ??
		'Wallet'

	const isWaitingForReceipt = setFeeToken.isSuccess && receipt.isPending

	const busy =
		connect.isPending ||
		switchChain.isPending ||
		setFeeToken.isPending ||
		isWaitingForReceipt ||
		showSuccess

	const needsChainSwitch = isConnected && !isOnTempoChain

	const label = showSuccess
		? 'Fee token set!'
		: isAlreadyFeeToken
			? 'Currently your fee token'
			: isWaitingForReceipt
				? 'Confirming…'
				: setFeeToken.isPending
					? 'Setting…'
					: switchChain.isPending
						? 'Switching network…'
						: connect.isPending
							? 'Connecting…'
							: needsChainSwitch
								? 'Switch to Tempo'
								: isConnected
									? `Set ${symbol ?? 'token'} as fee token`
									: `Connect ${walletName}`

	return (
		<button
			type="button"
			disabled={busy || isAlreadyFeeToken}
			className={cx(
				'flex items-center justify-center gap-2 w-full rounded-lg border px-3 py-2 text-[13px] font-sans font-medium transition-colors',
				isAlreadyFeeToken
					? 'cursor-default'
					: 'cursor-pointer press-down',
				showSuccess
					? 'border-positive/30 text-positive bg-positive/5'
					: isAlreadyFeeToken
						? 'border-base-border text-tertiary bg-base-plane'
						: busy
							? 'border-base-border text-secondary bg-base-plane animate-pulse'
							: 'border-base-border text-secondary bg-base-plane hover:bg-base-plane-interactive hover:text-primary',
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
