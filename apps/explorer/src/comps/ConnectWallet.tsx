import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClientOnly, Link } from '@tanstack/react-router'
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
import { Actions } from 'viem/tempo'
import { Hooks } from 'wagmi/tempo'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { cx } from '#lib/css'
import { getApiUrl } from '#lib/env.ts'
import { getFeeTokenForChain } from '#lib/tokenlist'
import { filterSupportedInjectedConnectors } from '#lib/wallets.ts'
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
		<ClientOnly
			fallback={
				<div className="text-[12px] flex items-center text-secondary whitespace-nowrap">
					Detecting wallet…
				</div>
			}
		>
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

	const hasConnectorOptions = injectedConnectors.length > 0

	if (!hasConnectorOptions)
		return (
			<div className="text-[12px] -tracking-[2%] flex items-center whitespace-nowrap select-none">
				No wallet found.
			</div>
		)
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
			<div className="flex items-center gap-1.5">
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
						className={cx(
							'flex gap-[8px] items-center rounded-[8px] bg-base-plane-interactive px-[10px] py-[6px] text-primary border border-base-border hover:bg-base-plane hover:no-underline transition-colors',
							pendingId === connector.id &&
								connect.isPending &&
								'animate-pulse',
						)}
					>
						{connector.icon ? (
							<img
								className="size-[12px] rounded-[2px]"
								src={connector.icon}
								alt={connector.name}
							/>
						) : (
							<LucideWalletCards className="size-[12px]" />
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
		<div className="flex items-stretch gap-2 justify-end min-w-0 flex-1">
			<ConnectedAddress />
			{TEMPO_CHAIN_ID !== 4217 && <FundAccountButton />}
			{showAddChain && !isSupported && (
				<Button
					className="w-fit"
					variant="accent"
					onClick={() =>
						switchChain.mutate({
							chainId: chains[0].id,
							addEthereumChainParameter: {
								blockExplorerUrls: ['https://explore.tempo.xyz'],
								nativeCurrency: { name: 'USD', decimals: 18, symbol: 'USD' },
							},
						})
					}
				>
					Add Tempo to {connector?.name ?? 'Wallet'}
				</Button>
			)}
			{switchChain.isSuccess && (
				<span className="text-[12px] font-normal text-tertiary whitespace-nowrap">
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
		<div className="text-[12px] text-secondary whitespace-nowrap flex items-center justify-end gap-[4px] flex-1 min-w-0">
			<span className="hidden sm:inline shrink-0">Connected as</span>
			<Link
				to="/address/$address"
				params={{ address }}
				title={address}
				className="text-accent press-down hover:underline font-mono flex min-w-0"
			>
				<span className="overflow-hidden text-ellipsis">
					{address.slice(0, -10)}
				</span>
				<span className="shrink-0">{address.slice(-10)}</span>
			</Link>
			{totalUsd !== null && (
				<span className="text-tertiary">
					(${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})
				</span>
			)}
		</div>
	)
}

const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as const

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
			<span className="text-[12px] text-tertiary flex items-center gap-1">
				Funded!
			</span>
		)
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
			className={cx(
				'h-full text-secondary hover:text-primary cursor-pointer press-down flex items-center gap-1',
				isPending && 'animate-pulse',
			)}
			onClick={handleFund}
		>
			<span className="text-tertiary">[</span>
			<span className="text-center my-auto font-bold text-[12px]">{label}</span>
			<span className="text-tertiary">]</span>
		</button>
	)
}

function SignOut() {
	const disconnect = useDisconnect()
	const { connector } = useConnection()

	return (
		<button
			type="button"
			title="Disconnect"
			className="h-full text-secondary hover:text-primary cursor-pointer press-down"
			onClick={() => disconnect.mutate({ connector })}
		>
			<LucideLogOut className="size-[12px] translate-y-px" />
		</button>
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
	const Element = render
		? (p: typeof props) => React.cloneElement(render, p)
		: 'button'
	return (
		<Element
			className={buttonClassName({
				className,
				disabled,
				static: static_,
				variant,
			})}
			{...rest}
		/>
	)
}

function buttonClassName(opts: {
	className?: string
	disabled?: boolean
	static?: boolean
	variant?: 'accent' | 'default' | 'destructive'
}) {
	const { className, disabled, static: static_, variant = 'default' } = opts
	return cx(
		'inline-flex gap-[6px] items-center whitespace-nowrap font-medium focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer press-down text-[12px] hover:underline',
		disabled && 'pointer-events-none opacity-50',
		static_ && 'pointer-events-none',
		variant === 'accent' && 'text-accent',
		variant === 'default' && 'text-secondary',
		variant === 'destructive' && 'text-negative',
		className,
	)
}
