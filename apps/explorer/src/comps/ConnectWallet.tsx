import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClientOnly, Link } from '@tanstack/react-router'
import { IconButton, Button as TdsButton, style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { formatUnits, type Chain, type Client, type Transport } from 'viem'
import {
	useChains,
	useClient,
	useConnect,
	useConnection,
	useConnectors,
	useDisconnect,
	useSwitchChain,
} from 'wagmi'
import { tempoModerato } from 'viem/chains'
import { Actions } from 'viem/tempo'
import { alphausd } from 'viem/tokens'
import { Hooks } from 'wagmi/tempo'
import { cx } from 'zyzz'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { getApiUrl } from '#lib/env.ts'
import { getFeeTokenForChain } from '#lib/fee-token'
import { filterSupportedInjectedConnectors } from '#lib/wallets.ts'
import { link, linkHover, pressDown, pulse } from '#styles/explorer'
import { getTempoChain } from '#wagmi.config.ts'
import LucideLogOut from '~icons/lucide/log-out'
import LucideWalletCards from '~icons/lucide/wallet-cards'

const TEMPO_CHAIN_ID = getTempoChain().id
const TEMPO_FEE_TOKEN = getFeeTokenForChain(TEMPO_CHAIN_ID)

export function ConnectWallet({
	showAddChain = true,
}: {
	showAddChain?: boolean
}) {
	return (
		<ClientOnly fallback={<div {...styles.detecting()}>Detecting wallet…</div>}>
			<ConnectWalletInner showAddChain={showAddChain} />
		</ClientOnly>
	)
}

function ConnectWalletInner({
	showAddChain = true,
}: {
	showAddChain?: boolean
}) {
	const connect = useConnect()
	const connectors = useConnectors()
	const { address, chain, connector } = useConnection()

	const [pendingId, setPendingId] = React.useState<string | null>(null)
	const injectedConnectors = React.useMemo(
		() => filterSupportedInjectedConnectors(connectors),
		[connectors],
	)
	const chains = useChains()
	const switchChain = useSwitchChain()
	const isSupported = chains.some((c) => c.id === chain?.id)
	const blockExplorerUrl = chains[0].blockExplorers?.default.url

	const hasConnectorOptions = injectedConnectors.length > 0

	if (!hasConnectorOptions)
		return <div {...styles.noWallet()}>No wallet found.</div>
	if (!address) {
		const brandedConnectors = injectedConnectors.filter(
			(candidate) =>
				candidate.id !== 'injected' && candidate.name !== 'Injected',
		)
		const prioritizedConnectors = [
			...(brandedConnectors.length > 0
				? brandedConnectors
				: injectedConnectors.filter(
						(candidate) => candidate.id === 'injected',
					)),
		]
			.sort((a, b) => {
				if (a.id === 'xyz.tempo') return -1
				if (b.id === 'xyz.tempo') return 1
				return 0
			})
			.slice(0, 2)

		return (
			<div {...styles.connectors()}>
				{prioritizedConnectors.map((connector) => (
					<Button
						type="button"
						variant="default"
						key={connector.id}
						onClick={() => {
							setPendingId(connector.id)
							connect.mutate(
								{ connector },
								{
									onSettled: () => setPendingId(null),
								},
							)
						}}
						className={
							cx(
								styles.connect(),
								pendingId === connector.id &&
									connect.isPending &&
									styles.pending(),
							).className
						}
					>
						{connector.icon ? (
							<img
								{...styles.connectorIcon()}
								src={connector.icon}
								alt={connector.name}
							/>
						) : (
							<LucideWalletCards {...styles.walletIcon()} />
						)}
						{connector.name && connector.name !== 'Injected'
							? `Connect ${connector.name}`
							: 'Connect Wallet'}
					</Button>
				))}
			</div>
		)
	}
	return (
		<div {...styles.connected()}>
			<ConnectedAddress />
			{TEMPO_CHAIN_ID !== 4217 && <FundAccountButton />}
			{showAddChain && !isSupported && (
				<Button
					className={styles.addChain().className}
					variant="accent"
					onClick={() =>
						switchChain.mutate({
							chainId: chains[0].id,
							addEthereumChainParameter: {
								...(blockExplorerUrl
									? { blockExplorerUrls: [blockExplorerUrl] }
									: {}),
								nativeCurrency: { name: 'USD', decimals: 18, symbol: 'USD' },
							},
						})
					}
				>
					Add Tempo to {connector?.name ?? 'Wallet'}
				</Button>
			)}
			{switchChain.isSuccess && (
				<span {...styles.added()}>
					Added Tempo to {connector?.name ?? 'Wallet'}!
				</span>
			)}
			<SignOut />
		</div>
	)
}

function ConnectedAddress() {
	const { address } = useConnection()
	const { isTokenListed } = useTokenListMembership()

	const { data: balanceData } = useQuery({
		queryKey: ['connected-balance', address],
		queryFn: async () => {
			const response = await fetch(
				getApiUrl(`/api/address/balances/${address}`),
				{ headers: { 'Content-Type': 'application/json' } },
			)
			return response.json() as Promise<{
				balances: Array<{
					token?: string
					balance: string
					decimals?: number
					currency?: string
				}>
			}>
		},
		enabled: !!address,
		staleTime: 30_000,
	})

	const totalUsd = React.useMemo(() => {
		if (!balanceData?.balances) return null
		const showUsdPrefix = TEMPO_FEE_TOKEN
			? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
			: true
		if (!showUsdPrefix) return null
		// Prefer showing only the fee token (pathUSD) balance
		const feeTokenBalance = TEMPO_FEE_TOKEN
			? balanceData.balances.find(
					(b) =>
						b.token?.toLowerCase() === TEMPO_FEE_TOKEN?.toLowerCase() &&
						b.currency === 'USD',
				)
			: undefined
		if (feeTokenBalance) {
			return Number(
				formatUnits(
					BigInt(feeTokenBalance.balance),
					feeTokenBalance.decimals ?? 6,
				),
			)
		}
		// Fallback: sum all USD balances (when no fee token balance exists)
		let total = 0
		for (const b of balanceData.balances) {
			if (b.currency !== 'USD') continue
			total += Number(formatUnits(BigInt(b.balance), b.decimals ?? 6))
		}
		return total || null
	}, [balanceData, isTokenListed])

	if (!address) return null

	return (
		<div {...styles.address()}>
			<span {...styles.addressPrefix()}>Connected as</span>
			<Link
				to="/address/$address"
				params={{ address }}
				title={address}
				{...cx(styles.addressLink(), link(), linkHover(), pressDown())}
			>
				<span {...styles.addressHead()}>{address.slice(0, -10)}</span>
				<span {...styles.addressTail()}>{address.slice(-10)}</span>
			</Link>
			{totalUsd !== null && (
				<span {...styles.balance()}>
					(${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})
				</span>
			)}
		</div>
	)
}

const ALPHA_USD = alphausd.addresses[tempoModerato.id]

function FundAccountButton() {
	const { address } = useConnection()
	const client = useClient()
	const queryClient = useQueryClient()
	const setFeeToken = Hooks.fee.useSetUserTokenSync()
	const userToken = Hooks.fee.useUserToken({ account: address })

	const [status, setStatus] = React.useState<
		'idle' | 'funding' | 'setting-fee' | 'done'
	>('idle')

	const fundAccount = useMutation({
		async mutationFn() {
			if (!address) throw new Error('address not found')
			if (!client) throw new Error('client not found')

			await Actions.faucet.fundSync(
				client as unknown as Client<Transport, Chain>,
				{ account: address },
			)

			await new Promise((resolve) => setTimeout(resolve, 400))
			queryClient.refetchQueries({ queryKey: ['connected-balance'] })
		},
	})

	const handleFund = async () => {
		if (!address) return
		setStatus('funding')

		fundAccount.mutate(undefined, {
			onSuccess: async () => {
				if (!userToken.data?.address) {
					setStatus('setting-fee')
					setFeeToken.mutate(
						{ token: ALPHA_USD, account: address },
						{
							onSuccess: () => setStatus('done'),
							onError: () => setStatus('done'),
						},
					)
				} else {
					setStatus('done')
				}
			},
			onError: () => setStatus('idle'),
		})
	}

	if (!address) return null

	if (status === 'done') {
		return <span {...styles.funded()}>Funded!</span>
	}

	const isPending = status === 'funding' || status === 'setting-fee'
	const label =
		status === 'funding'
			? 'Funding…'
			: status === 'setting-fee'
				? 'Setting fee token…'
				: 'Fund'

	return (
		<button
			type="button"
			title="Fund from faucet and set fee token"
			disabled={isPending}
			{...cx(
				styles.walletAction(),
				styles.fund(),
				isPending && styles.pending(),
				pressDown(),
			)}
			onClick={handleFund}
		>
			<span {...styles.bracket()}>[</span>
			<span {...styles.fundLabel()}>{label}</span>
			<span {...styles.bracket()}>]</span>
		</button>
	)
}

function SignOut() {
	const disconnect = useDisconnect()
	const { connector } = useConnection()

	return (
		<IconButton
			aria-label="Disconnect"
			onClick={() => disconnect.mutate({ connector })}
			scale="small"
			title="Disconnect"
			variant="tertiary"
			{...cx(styles.signOut(), pressDown())}
		>
			<LucideLogOut />
		</IconButton>
	)
}

export function Button(
	props: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & {
		className?: string
		disabled?: boolean
		static?: boolean
		variant?: 'accent' | 'default' | 'destructive'
		render?: React.ReactElement
	},
) {
	const {
		className,
		disabled,
		render,
		static: static_,
		variant,
		...rest
	} = props
	return (
		<TdsButton
			type="button"
			{...rest}
			// TDS Button forwards `render` to its Base UI button.
			{...(render ? { render } : {})}
			disabled={disabled || static_}
			scale="small"
			// TDS has no negative button, so destructive actions use secondary.
			variant={variant === 'accent' ? 'primary' : 'secondary'}
			className={className}
		/>
	)
}

namespace styles {
	export const detecting = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
	})

	export const noWallet = style({
		alignItems: 'center',
		display: 'flex',
		typography: 'body.b3',
		userSelect: 'none',
		whiteSpace: 'nowrap',
	})

	export const connectors = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	// TDS Button owns size, fill, radius, and type; only placement is added.
	export const connect = style({ flexShrink: 0 })

	export const pending = style({
		animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
	})

	export const connectorIcon = style({
		borderRadius: '2px !custom',
		height: '12',
		width: '12',
	})

	export const walletIcon = style({ height: '12', width: '12' })

	export const connected = style({
		alignItems: 'stretch',
		display: 'flex',
		flex: 1,
		gap: '8',
		justifyContent: 'flex-end',
		minWidth: '0px !custom',
	})

	export const addChain = style({ width: 'fit-content !custom' })

	export const added = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
	})

	export const address = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		flex: 1,
		gap: '4',
		justifyContent: 'flex-end',
		minWidth: '0px !custom',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
	})

	export const addressPrefix = style({
		display: 'none',
		flexShrink: 0,
		'@media (width >= 640px)': { display: 'inline' },
	})

	export const addressLink = style({
		display: 'flex',
		minWidth: '0px !custom',
		typography: 'mono.inline',
	})

	export const addressHead = style({
		overflow: 'hidden',
		textOverflow: 'ellipsis',
	})

	export const addressTail = style({ flexShrink: 0 })

	export const balance = style({ color: 'content.tertiary' })

	export const funded = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		gap: '4',
		typography: 'body.b3',
	})

	export const walletAction = style({
		color: 'content.secondary',
		cursor: 'pointer',
		height: '100% !custom',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
	})

	export const fund = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
	})

	export const bracket = style({ color: 'content.tertiary' })

	export const fundLabel = style({
		marginBlock: 'auto !custom',
		textAlign: 'center',
		typography: 'body.b3Strong',
	})

	// TDS IconButton owns size, color, radius, and focus ring.
	export const signOut = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})
}
