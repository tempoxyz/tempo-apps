import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClientOnly } from '@tanstack/react-router'
import { Amount, Button, Tag, Tooltip, style } from '@tempoxyz/ds'
import { LogOut, Wallet } from '@tempoxyz/ds/icons'
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
import { Address } from '#comps/Address'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { getApiUrl } from '#lib/env.ts'
import { getFeeTokenForChain } from '#lib/fee-token'
import { filterSupportedInjectedConnectors } from '#lib/wallets.ts'
import { getTempoChain } from '#wagmi.config.ts'

const TEMPO_CHAIN_ID = getTempoChain().id
const TEMPO_FEE_TOKEN = getFeeTokenForChain(TEMPO_CHAIN_ID)

export function ConnectWallet(props: ConnectWallet.Props): React.JSX.Element {
	return (
		<ClientOnly fallback={<div {...styles.detecting()}>Detecting wallet…</div>}>
			<ConnectWalletInner showAddChain={props.showAddChain ?? true} />
		</ClientOnly>
	)
}

export declare namespace ConnectWallet {
	type Props = {
		/** Offers to add Tempo when the wallet is on another network. */
		showAddChain?: boolean | undefined
	}
}

function ConnectWalletInner(props: { showAddChain: boolean }) {
	const { showAddChain } = props
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
						loading={pendingId === connector.id && connect.isPending}
						size="small"
						variant="secondary"
						{...styles.action()}
					>
						{connector.icon ? (
							<img alt="" src={connector.icon} {...styles.connectorIcon()} />
						) : (
							<Wallet {...styles.icon()} />
						)}
						{connector.name && connector.name !== 'Injected'
							? `Connect ${connector.name}`
							: 'Connect wallet'}
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
					size="small"
					variant="primary"
					{...styles.action()}
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
					Add Tempo to {connector?.name ?? 'wallet'}
				</Button>
			)}
			{switchChain.isSuccess && (
				<Tag intent="positive" variant="plain">
					<Tag.Dot />
					Added Tempo to {connector?.name ?? 'wallet'}
				</Tag>
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
			<Address address={address} />
			{totalUsd !== null && <Amount currency="USD" value={totalUsd} />}
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
		return (
			<Tag intent="positive" variant="plain">
				<Tag.Dot />
				Funded
			</Tag>
		)
	}

	const isPending = status === 'funding' || status === 'setting-fee'

	return (
		<Tooltip.Root>
			<Tooltip.Trigger
				render={
					<Button
						focusableWhenDisabled
						loading={isPending}
						onClick={handleFund}
						size="small"
						variant="secondary"
						{...styles.action()}
					/>
				}
			>
				Fund account
			</Tooltip.Trigger>
			<Tooltip.Popup>Fund from faucet and set fee token</Tooltip.Popup>
		</Tooltip.Root>
	)
}

function SignOut() {
	const disconnect = useDisconnect()
	const { connector } = useConnection()

	return (
		<Tooltip.Root>
			<Tooltip.Trigger
				render={
					<Button
						aria-label="Disconnect wallet"
						onClick={() => disconnect.mutate({ connector })}
						shape="icon"
						size="small"
						variant="text"
					/>
				}
			>
				<LogOut {...styles.icon()} />
			</Tooltip.Trigger>
			<Tooltip.Popup>Disconnect wallet</Tooltip.Popup>
		</Tooltip.Root>
	)
}

namespace styles {
	export const icon = style({ fontSize: '16' })

	export const detecting = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
		typography: 'label.12',
		whiteSpace: 'nowrap',
	})

	export const noWallet = style({
		alignItems: 'center',
		display: 'flex',
		typography: 'label.12',
		userSelect: 'none',
		whiteSpace: 'nowrap',
	})

	export const connectors = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const action = style({ flexShrink: 0 })

	export const connected = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		gap: '8',
		justifyContent: 'flex-end',
		minWidth: '0',
	})

	export const address = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
		flex: 1,
		gap: '4',
		justifyContent: 'flex-end',
		minWidth: '0',
		typography: 'label.12',
		whiteSpace: 'nowrap',
	})

	export const addressPrefix = style({
		display: 'none',
		flexShrink: 0,
		'@media (width >= 640px)': { display: 'inline' },
	})

	export const connectorIcon = style({
		flexShrink: '0 !custom',
		height: '16',
		width: '16',
	})
}
