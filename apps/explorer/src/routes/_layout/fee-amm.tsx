import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import type * as React from 'react'
import { useMemo } from 'react'
import { Abis, Addresses } from 'viem/tempo'
import { useReadContracts } from 'wagmi'
import { Amount } from '#comps/Amount'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { getAccountTag } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import { HexFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import { withLoaderTiming } from '#lib/profiling'
import { feeAmmPoolsQueryOptions, type FeeAmmPool } from '#lib/queries'

export const Route = createFileRoute('/_layout/fee-amm')({
	component: FeeAmmPage,
	head: () => ({
		meta: [{ title: 'Fee AMM – Tempo Explorer' }],
	}),
	loader: ({ context }) =>
		withLoaderTiming('/_layout/fee-amm', async () =>
			context.queryClient.ensureQueryData(feeAmmPoolsQueryOptions()),
		),
})

function FeeAmmPage(): React.JSX.Element {
	const loaderData = Route.useLoaderData()
	const { data, isPending } = useQuery({
		...feeAmmPoolsQueryOptions(),
		initialData: loaderData,
	})
	const pools = data ?? []
	const uniqueTokenAddresses = useMemo(
		() => [
			...new Set(
				pools.flatMap((pool) => [pool.userToken, pool.validatorToken]),
			),
		],
		[pools],
	)
	const { data: tokenMetadataResults } = useReadContracts({
		contracts: uniqueTokenAddresses.flatMap((address) => [
			{ address, abi: Abis.tip20, functionName: 'name' as const },
			{ address, abi: Abis.tip20, functionName: 'symbol' as const },
			{ address, abi: Abis.tip20, functionName: 'decimals' as const },
		]),
		query: {
			enabled: uniqueTokenAddresses.length > 0,
		},
	})
	const tokenMetadataByAddress = useMemo(() => {
		const metadataByAddress = new Map<Address.Address, PoolTokenMetadata>()

		for (const [index, address] of uniqueTokenAddresses.entries()) {
			const resultIndex = index * 3
			const name = normalizeTokenText(
				tokenMetadataResults?.[resultIndex]?.result,
			)
			const symbol = normalizeTokenText(
				tokenMetadataResults?.[resultIndex + 1]?.result,
			)
			const decimalsResult = tokenMetadataResults?.[resultIndex + 2]?.result
			const decimals =
				typeof decimalsResult === 'number' ? decimalsResult : undefined

			metadataByAddress.set(address, { name, symbol, decimals })
		}

		return metadataByAddress
	}, [tokenMetadataResults, uniqueTokenAddresses])

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	const columns: DataGrid.Column[] = [
		{ label: 'Pool', align: 'start', width: '2fr', minWidth: 220 },
		{ label: 'Reserves', align: 'start', width: '3fr', minWidth: 280 },
	]

	const stackedColumns: DataGrid.Column[] = [
		{ label: 'Pool', align: 'start', minWidth: 180 },
		{ label: 'Reserves', align: 'start', minWidth: 200 },
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-col gap-2">
				<h1 className="text-[32px] leading-none tracking-[-0.02em] font-semibold text-primary">
					Fee AMM
				</h1>
				<p className="text-sm text-secondary max-w-[720px]">
					Discovered Fee AMM pools on{' '}
					<Link
						to="/address/$address"
						params={{ address: Addresses.feeManager }}
						className="text-accent hover:underline font-mono"
					>
						{Addresses.feeManager}
					</Link>
					.
				</p>
			</div>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Pools',
						totalItems: `${pools.length}`,
						itemsLabel: 'pools',
						autoCollapse: false,
						content: (
							<DataGrid
								columns={{ stacked: stackedColumns, tabs: columns }}
								items={() =>
									pools.map((pool) => ({
										cells: [
											<PoolPairCell
												key="pool"
												pool={pool}
												tokenMetadataByAddress={tokenMetadataByAddress}
											/>,
											<PoolReservesCell
												key="reserves"
												pool={pool}
												tokenMetadataByAddress={tokenMetadataByAddress}
											/>,
										],
									}))
								}
								totalItems={pools.length}
								page={1}
								loading={isPending}
								itemsLabel="pools"
								itemsPerPage={pools.length || 10}
								emptyState="No Fee AMM pools found."
								pagination={false}
							/>
						),
					},
				]}
				activeSection={0}
			/>
		</div>
	)
}

export function PoolPairCell(props: PoolPairCell.Props): React.JSX.Element {
	const { pool, tokenMetadataByAddress } = props
	const userToken = getPoolTokenDisplay(
		pool.userToken,
		tokenMetadataByAddress.get(pool.userToken),
	)
	const validatorToken = getPoolTokenDisplay(
		pool.validatorToken,
		tokenMetadataByAddress.get(pool.validatorToken),
	)

	return (
		<div className="flex items-center gap-3 min-w-0 font-sans">
			<PoolTokenLink token={userToken} />
			<span className="text-tertiary shrink-0">→</span>
			<PoolTokenLink token={validatorToken} />
		</div>
	)
}

export declare namespace PoolPairCell {
	type Props = {
		pool: FeeAmmPool
		tokenMetadataByAddress: Map<Address.Address, PoolTokenMetadata>
	}
}

export function PoolReservesCell(
	props: PoolReservesCell.Props,
): React.JSX.Element {
	const { pool, tokenMetadataByAddress } = props
	const userTokenMetadata = tokenMetadataByAddress.get(pool.userToken)
	const validatorTokenMetadata = tokenMetadataByAddress.get(pool.validatorToken)

	return (
		<div className="flex flex-col items-start gap-2 min-w-0 font-sans">
			<div className="min-w-0">
				<Amount
					value={pool.reserveUserToken}
					token={pool.userToken}
					decimals={
						userTokenMetadata?.symbol ? userTokenMetadata.decimals : undefined
					}
					symbol={userTokenMetadata?.symbol}
					short
					maxWidth={16}
				/>
			</div>
			<div className="min-w-0">
				<Amount
					value={pool.reserveValidatorToken}
					token={pool.validatorToken}
					decimals={
						validatorTokenMetadata?.symbol
							? validatorTokenMetadata.decimals
							: undefined
					}
					symbol={validatorTokenMetadata?.symbol}
					short
					maxWidth={16}
				/>
			</div>
		</div>
	)
}

export declare namespace PoolReservesCell {
	type Props = {
		pool: FeeAmmPool
		tokenMetadataByAddress: Map<Address.Address, PoolTokenMetadata>
	}
}

export function PoolTokenLink(props: PoolTokenLink.Props): React.JSX.Element {
	const { token } = props
	const to = isTip20Address(token.address)
		? '/token/$address'
		: '/address/$address'

	return (
		<Link
			to={to}
			params={{ address: token.address }}
			className="group inline-flex items-center gap-2 min-w-0"
			title={
				token.secondaryLabel
					? `${token.primaryLabel} · ${token.secondaryLabel}\n${token.address}`
					: token.address
			}
		>
			<TokenIcon
				address={token.address}
				name={token.symbol ?? token.primaryLabel}
			/>
			<span className="flex flex-col min-w-0 leading-tight">
				<span className="text-accent group-hover:underline truncate font-medium">
					{token.primaryLabel}
				</span>
				{token.secondaryLabel ? (
					<span className="text-[12px] text-tertiary truncate">
						{token.secondaryLabel}
					</span>
				) : null}
			</span>
		</Link>
	)
}

export declare namespace PoolTokenLink {
	type Props = {
		token: PoolTokenDisplay
	}
}

type PoolTokenMetadata = {
	decimals?: number | undefined
	name?: string | undefined
	symbol?: string | undefined
}

type PoolTokenDisplay = {
	address: Address.Address
	primaryLabel: string
	secondaryLabel?: string | undefined
	symbol?: string | undefined
}

function normalizeTokenText(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const normalized = value.trim()
	return normalized.length > 0 ? normalized : undefined
}

function getPoolTokenDisplay(
	address: Address.Address,
	metadata: PoolTokenMetadata | undefined,
): PoolTokenDisplay {
	const taggedLabel = getAccountTag(address)?.label
	const symbol = normalizeTokenText(metadata?.symbol)
	const name = normalizeTokenText(metadata?.name)
	const addressLabel = HexFormatter.truncate(address)
	const primaryLabel = symbol ?? taggedLabel ?? addressLabel
	const secondaryLabel = [name, taggedLabel, addressLabel].find(
		(value) =>
			value !== undefined && value.toLowerCase() !== primaryLabel.toLowerCase(),
	)

	return {
		address,
		primaryLabel,
		secondaryLabel,
		symbol,
	}
}
