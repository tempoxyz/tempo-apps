import { Link } from '@tanstack/react-router'
import { createFileRoute, notFound, rootRouteId } from '@tanstack/react-router'
import type { Address as OxAddress, Hex } from 'ox'
import * as Address from 'ox/Address'
import * as HexUtils from 'ox/Hex'
import * as Value from 'ox/Value'
import { useState } from 'react'
import { recoverTypedDataAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getPublicClient } from 'wagmi/actions'
import { Actions } from 'wagmi/tempo'
import type { Config } from 'wagmi'
import * as z from 'zod/mini'
import { Midcut } from 'midcut'
import { ReceiptMark } from '#comps/ReceiptMark'
import { CopyButton } from '#comps/CopyButton'
import { cx } from '#lib/css'
import { DateFormatter, PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import { STREAM_CHANNEL } from '#lib/domain/known-events'
import { isTip20Address } from '#lib/domain/tip20'
import { withLoaderTiming } from '#lib/profiling'
import { getTempoChain, getWagmiConfig } from '#wagmi.config.ts'

const escrowAbi = [
	{
		type: 'function',
		name: 'getChannel',
		inputs: [{ name: 'channelId', type: 'bytes32' }],
		outputs: [
			{
				name: '',
				type: 'tuple',
				components: [
					{ name: 'finalized', type: 'bool' },
					{ name: 'closeRequestedAt', type: 'uint64' },
					{ name: 'payer', type: 'address' },
					{ name: 'payee', type: 'address' },
					{ name: 'token', type: 'address' },
					{ name: 'authorizedSigner', type: 'address' },
					{ name: 'deposit', type: 'uint128' },
					{ name: 'settled', type: 'uint128' },
				],
			},
		],
		stateMutability: 'view',
	},
] as const

type ChannelState = {
	finalized: boolean
	closeRequestedAt: bigint
	payer: OxAddress.Address
	payee: OxAddress.Address
	token: OxAddress.Address
	authorizedSigner: OxAddress.Address
	deposit: bigint
	settled: bigint
}

const UINT128_MAX = (1n << 128n) - 1n

const voucherTypes = {
	Voucher: [
		{ name: 'channelId', type: 'bytes32' },
		{ name: 'cumulativeAmount', type: 'uint128' },
	],
} as const

type VoucherReceiptData = {
	channelId: Hex.Hex
	cumulativeAmount: bigint
	signature: Hex.Hex
	channel: ChannelState
	verified: boolean
	closeRequestedFormatted: string | undefined
	tokenMetadata: { symbol: string; decimals: number } | undefined
}

async function fetchVoucherData(params: {
	channelId: Hex.Hex
	cumulativeAmount: string
	signature: Hex.Hex
}): Promise<VoucherReceiptData> {
	const config = getWagmiConfig()
	const client = getPublicClient(config)
	if (!client) throw new Error('RPC client unavailable')

	if (!/^\d+$/.test(params.cumulativeAmount))
		throw new Error('Invalid cumulativeAmount')
	const cumulativeAmount = BigInt(params.cumulativeAmount)
	if (cumulativeAmount > UINT128_MAX)
		throw new Error('cumulativeAmount exceeds uint128')

	const channel = (await readContract(client, {
		address: STREAM_CHANNEL as OxAddress.Address,
		abi: escrowAbi,
		functionName: 'getChannel',
		args: [params.channelId],
	})) as ChannelState

	if (channel.payer === '0x0000000000000000000000000000000000000000')
		throw new Error('Channel not found')

	let verified = false
	try {
		const chain = getTempoChain()
		const signer = await recoverTypedDataAddress({
			domain: {
				name: 'Tempo Stream Channel',
				version: '1',
				chainId: chain.id,
				verifyingContract: STREAM_CHANNEL as OxAddress.Address,
			},
			types: voucherTypes,
			primaryType: 'Voucher',
			message: {
				channelId: params.channelId,
				cumulativeAmount,
			},
			signature: params.signature,
		})
		verified = Address.isEqual(signer, channel.authorizedSigner)
	} catch {}

	const closeRequestedFormatted =
		channel.closeRequestedAt > 0n
			? DateFormatter.format(channel.closeRequestedAt)
			: undefined

	let tokenMetadata: { symbol: string; decimals: number } | undefined
	if (isTip20Address(channel.token)) {
		try {
			const meta = await Actions.token.getMetadata(config as Config, {
				token: channel.token,
			})
			tokenMetadata = { symbol: meta.symbol, decimals: meta.decimals }
		} catch {}
	}

	return {
		channelId: params.channelId,
		cumulativeAmount,
		signature: params.signature,
		channel,
		verified,
		closeRequestedFormatted,
		tokenMetadata,
	}
}

export const Route = createFileRoute('/_layout/receipt/voucher')({
	component: Component,
	validateSearch: z.object({
		channelId: z.string(),
		cumulativeAmount: z.string(),
		signature: z.string(),
	}),
	loader: ({ location }) =>
		withLoaderTiming('/_layout/receipt/voucher', async () => {
			const search = location.search as {
				channelId: string
				cumulativeAmount: string
				signature: string
			}

			if (
				!HexUtils.validate(search.channelId as Hex.Hex) ||
				HexUtils.size(search.channelId as Hex.Hex) !== 32 ||
				!HexUtils.validate(search.signature as Hex.Hex) ||
				!/^\d+$/.test(search.cumulativeAmount)
			)
				throw notFound({
					routeId: rootRouteId,
					data: { type: 'voucher', value: search.channelId },
				})

			try {
				return await fetchVoucherData({
					channelId: search.channelId as Hex.Hex,
					cumulativeAmount: search.cumulativeAmount,
					signature: search.signature as Hex.Hex,
				})
			} catch (error) {
				console.error(error)
				throw notFound({
					routeId: rootRouteId,
					data: { type: 'voucher', value: search.channelId },
				})
			}
		}),
	head: ({ loaderData }) => {
		const channelId = loaderData?.channelId ?? ''
		const short = channelId
			? `${channelId.slice(0, 10)}…${channelId.slice(-6)}`
			: 'Unknown'
		const title = `MPP Voucher ${short} ⋅ Tempo Explorer`

		return {
			title,
			meta: [
				{ title },
				{ name: 'robots', content: 'noindex,nofollow,noarchive' },
				{ property: 'og:title', content: title },
				{
					property: 'og:description',
					content: 'View offchain payment channel state on Tempo Explorer.',
				},
			],
		}
	},
})

function getChannelStatus(channel: ChannelState): {
	label: string
	color: string
} {
	if (channel.finalized)
		return { label: 'Closed', color: 'text-base-content-negative' }
	if (channel.closeRequestedAt > 0n)
		return { label: 'Closing', color: 'text-warning' }
	return { label: 'Open', color: 'text-positive' }
}

function Component(): React.JSX.Element {
	const data = Route.useLoaderData() as VoucherReceiptData
	const {
		channelId,
		cumulativeAmount,
		signature,
		channel,
		verified,
		closeRequestedFormatted,
		tokenMetadata,
	} = data

	const [channelIdExpanded, setChannelIdExpanded] = useState(false)
	const copyChannelId = useCopy()

	const decimals = tokenMetadata?.decimals ?? 6
	const symbol = tokenMetadata?.symbol

	const depositFormatted = Value.format(channel.deposit, decimals)
	const settledFormatted = Value.format(channel.settled, decimals)
	const cumulativeFormatted = Value.format(cumulativeAmount, decimals)
	const unsettled =
		cumulativeAmount > channel.settled ? cumulativeAmount - channel.settled : 0n
	const unsettledFormatted = Value.format(unsettled, decimals)
	const remaining =
		channel.deposit > cumulativeAmount ? channel.deposit - cumulativeAmount : 0n
	const remainingFormatted = Value.format(remaining, decimals)

	const status = getChannelStatus(channel)

	const formatAmount = (raw: string) =>
		symbol
			? `${PriceFormatter.formatAmountShort(raw)} ${symbol}`
			: PriceFormatter.formatAmountShort(raw)

	return (
		<div className="font-mono text-[13px] flex flex-col items-center justify-center gap-8 pt-16 pb-8 grow print:pt-8 print:pb-0 print:grow-0">
			<div
				data-receipt
				className="flex flex-col w-[360px] bg-base-alt border border-base-border border-b-0 shadow-[0px_4px_44px_rgba(0,0,0,0.25)] rounded-[10px] rounded-br-none rounded-bl-none text-base-content"
			>
				{!verified && (
					<div className="px-[20px] pt-[16px]">
						<div className="text-[11px] uppercase tracking-wider text-base-content-negative bg-base-content-negative/10 rounded-[6px] px-[10px] py-[6px] text-center font-semibold">
							Unverified signature
						</div>
					</div>
				)}

				{/* Header */}
				<div className="flex items-start gap-[40px] px-[20px] pt-[24px] pb-[16px]">
					<div className="shrink-0">
						<ReceiptMark />
					</div>
					<div className="flex flex-col gap-[8px] font-mono text-[13px] leading-[16px] flex-1">
						<div className="flex justify-between items-end">
							<span className="text-tertiary">Status</span>
							<span
								className={cx(
									'text-[11px] uppercase font-semibold',
									status.color,
								)}
							>
								{status.label}
							</span>
						</div>
						<div className="flex justify-between items-start gap-4">
							<div className="relative shrink-0">
								<span className="text-tertiary">Channel</span>
								{copyChannelId.notifying && (
									<span className="absolute left-[calc(100%+8px)] text-[13px] leading-[16px] text-accent">
										copied
									</span>
								)}
							</div>
							{channelIdExpanded ? (
								<button
									type="button"
									onClick={() => copyChannelId.copy(channelId)}
									className="text-right break-all max-w-[11ch] cursor-pointer press-down min-w-0 flex-1"
								>
									{channelId}
								</button>
							) : (
								<button
									type="button"
									onClick={() => setChannelIdExpanded(true)}
									className="text-right cursor-pointer press-down min-w-0 flex-1 flex justify-end"
								>
									<Midcut value={channelId} prefix="0x" align="end" min={4} />
								</button>
							)}
						</div>
						<div className="flex justify-between items-end gap-4">
							<span className="text-tertiary shrink-0">Payer</span>
							<Link
								to="/address/$address"
								params={{ address: channel.payer }}
								className="text-accent text-right press-down min-w-0 flex-1 flex justify-end"
							>
								<Midcut value={channel.payer} prefix="0x" align="end" min={4} />
							</Link>
						</div>
						<div className="flex justify-between items-end gap-4">
							<span className="text-tertiary shrink-0">Payee</span>
							<Link
								to="/address/$address"
								params={{ address: channel.payee }}
								className="text-accent text-right press-down min-w-0 flex-1 flex justify-end"
							>
								<Midcut value={channel.payee} prefix="0x" align="end" min={4} />
							</Link>
						</div>
						{symbol && (
							<div className="flex justify-between items-end gap-4">
								<span className="text-tertiary shrink-0">Token</span>
								<Link
									to="/token/$address"
									params={{ address: channel.token }}
									className="text-accent text-right press-down"
								>
									{symbol}
								</Link>
							</div>
						)}
					</div>
				</div>

				{/* On-chain channel state */}
				<div className="border-t border-dashed border-base-border" />
				<div className="flex flex-col gap-[8px] px-[20px] py-[16px] font-mono text-[13px] leading-[16px]">
					<div className="text-tertiary text-[11px] uppercase tracking-wider mb-[4px]">
						On-chain
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary">Deposit</span>
						<span>{formatAmount(depositFormatted)}</span>
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary">Settled</span>
						<span>{formatAmount(settledFormatted)}</span>
					</div>
					{closeRequestedFormatted && (
						<div className="flex justify-between items-end">
							<span className="text-tertiary">Close requested</span>
							<span className="text-right">{closeRequestedFormatted}</span>
						</div>
					)}
				</div>

				{/* Offchain voucher state */}
				<div className="border-t border-dashed border-base-border" />
				<div className="flex flex-col gap-[8px] px-[20px] py-[16px] font-mono text-[13px] leading-[16px]">
					<div className="text-tertiary text-[11px] uppercase tracking-wider mb-[4px]">
						Off-chain (voucher)
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary">Cumulative</span>
						<span>{formatAmount(cumulativeFormatted)}</span>
					</div>
					<div className="flex justify-between items-end">
						<span className="text-tertiary">Unsettled</span>
						<span className="text-warning">
							{formatAmount(unsettledFormatted)}
						</span>
					</div>
				</div>

				{/* Totals */}
				<div className="border-t border-dashed border-base-border" />
				<div className="flex flex-col gap-2 px-[20px] py-[16px] font-mono text-[13px] leading-4">
					<div className="flex justify-between items-center">
						<span className="text-tertiary">Remaining</span>
						<span>{formatAmount(remainingFormatted)}</span>
					</div>
				</div>
			</div>

			{/* Signature footer */}
			<div className="flex flex-col items-center -mt-8 w-full print:hidden">
				<div className="max-w-[360px] w-full">
					<div className="flex items-center justify-between gap-[8px] bg-base-plane-interactive border border-base-border rounded-bl-[10px]! rounded-br-[10px]! px-[12px] py-[12px] -mt-px text-[13px] font-sans text-tertiary">
						<span className="truncate">
							Sig: {signature.slice(0, 10)}…{signature.slice(-8)}
						</span>
						<CopyButton value={signature} ariaLabel="Copy signature" />
					</div>
				</div>
			</div>
		</div>
	)
}
