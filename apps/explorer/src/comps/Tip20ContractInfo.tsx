import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button, Callout, Rows, Skeleton, style } from '@tempoxyz/ds'
import { ArrowRight } from '@tempoxyz/ds/icons'
import type { Address } from 'ox'
import { Addresses } from 'viem/tempo'
import type * as React from 'react'
import { useChainId } from 'wagmi'
import { cx } from 'zyzz'
import { Address as AddressComp } from '#comps/Address.tsx'
import { ContractSection, Tip20Links } from '#comps/Contract.tsx'
import { TokenFeeAmm } from '#comps/FeeAmmPools'
import { TokenTrust } from '#comps/TokenTrust'
import { getApiUrl } from '#lib/env.ts'
import { link, linkHover } from '#styles/explorer'
import type { Tip20RolesResponse } from '#routes/api/tip20-roles'

function formatDate(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

export function Tip20TokenTabContent(
	props: Tip20TokenTabContent.Props,
): React.JSX.Element {
	const { address } = props
	const chainId = useChainId()
	const { data: metadataData, isPending: metadataPending } = useQuery<{
		createdTimestamp: number | null
		createdTxHash: `0x${string}` | null
		createdBy: Address.Address | null
	}>({
		queryKey: ['address-metadata', address],
		queryFn: async () => {
			const response = await fetch(
				getApiUrl(`/api/address/metadata/${address}`),
			)
			if (!response.ok)
				return { createdTimestamp: null, createdTxHash: null, createdBy: null }
			return response.json()
		},
	})
	const query = useQuery<Tip20RolesResponse>({
		queryKey: ['tip20-data', address, chainId],
		queryFn: async () => {
			const url = getApiUrl(
				'/api/tip20-roles',
				new URLSearchParams({ address, chainId: String(chainId) }),
			)
			const response = await fetch(url)
			if (!response.ok)
				throw new Error(`Failed to fetch TIP-20 data: ${response.status}`)
			return response.json()
		},
	})
	const config = query.isError ? undefined : query.data?.config
	return (
		<div {...styles.root()}>
			{query.isError && (
				<Callout intent="warning" role="status" size="small">
					<Callout.Icon />
					<Callout.Content>Token configuration unavailable.</Callout.Content>
					<Callout.Action onClick={() => void query.refetch()}>
						Try again
					</Callout.Action>
				</Callout>
			)}
			<ContractSection
				title="Metadata"
				description={<Tip20Links />}
				actions={
					address.toLowerCase() !== Addresses.pathUsd && (
						<Button.Link
							render={
								<Link
									to="/dex/$from/$to"
									params={{ from: address, to: Addresses.pathUsd }}
								/>
							}
							size="small"
							variant="secondary"
						>
							View DEX route
							<ArrowRight />
						</Button.Link>
					)
				}
			>
				<Rows dividers="full">
					<MetadataRow
						label="Currency"
						loading={query.isPending}
						value={config?.currency}
					/>
					<MetadataRow
						label="Decimals"
						loading={query.isPending}
						value={config?.decimals}
					/>
					<MetadataRow
						label="Total supply"
						loading={query.isPending}
						value={config?.totalSupply}
					/>
					<MetadataRow
						label="Supply cap"
						loading={query.isPending}
						value={config?.supplyCap}
					/>
					<MetadataRow
						label="Created"
						loading={metadataPending}
						value={
							metadataData?.createdTimestamp != null && (
								<span {...styles.created()}>
									<time
										dateTime={new Date(
											metadataData.createdTimestamp * 1000,
										).toISOString()}
									>
										{formatDate(metadataData.createdTimestamp)}
									</time>
									{metadataData.createdTxHash && (
										<Link
											to="/tx/$hash"
											params={{ hash: metadataData.createdTxHash }}
											{...cx(link(), linkHover())}
										>
											View transaction
										</Link>
									)}
								</span>
							)
						}
					/>
					{metadataData?.createdBy && (
						<MetadataRow
							label="Created by"
							value={
								<span {...styles.address()}>
									<AddressComp address={metadataData.createdBy} align="end" />
								</span>
							}
						/>
					)}
				</Rows>
			</ContractSection>
			<TokenTrust
				address={address}
				roles={query.data?.roles ?? []}
				loading={query.isPending}
				unavailable={query.isError || Boolean(query.data?.rolesUnavailable)}
				onRetry={() => void query.refetch()}
			/>
			<ContractSection
				title="Fee AMM liquidity"
				description="Pools that use this token to pay or receive transaction fees."
				actions={
					<Button.Link
						render={
							<Link
								to="/fee-amm"
								search={{ token: address, page: 1, limit: 10 }}
							/>
						}
						size="small"
						variant="secondary"
					>
						View all pools
						<ArrowRight />
					</Button.Link>
				}
			>
				<TokenFeeAmm address={address} />
			</ContractSection>
		</div>
	)
}

/** A metadata value: a placeholder while it loads, then None if it is missing. */
function MetadataRow(props: {
	label: string
	loading?: boolean | undefined
	value: React.ReactNode
}): React.JSX.Element {
	const missing =
		props.value === undefined || props.value === null || props.value === false
	return (
		<Rows.Row spacing="none">
			<Rows.Label>{props.label}</Rows.Label>
			<span {...styles.value()}>
				{props.loading ? (
					<Skeleton shape="pill" {...styles.skeleton()} />
				) : missing ? (
					<span {...styles.placeholder()}>None</span>
				) : (
					props.value
				)}
			</span>
		</Rows.Row>
	)
}

export declare namespace Tip20TokenTabContent {
	type Props = { address: Address.Address }
}

namespace styles {
	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '32',
	})

	export const value = style({
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0',
		overflowWrap: 'anywhere',
		textAlign: 'end',
	})

	export const placeholder = style({ color: 'gray.900' })

	export const skeleton = style({ height: '12', width: '6rem !custom' })

	export const created = style({
		alignItems: 'baseline',
		columnGap: '12',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'flex-end',
		rowGap: '4',
	})

	// Rows guidance: cap a Hex so it ends with the other values.
	export const address = style({
		display: 'inline-flex',
		maxWidth: '12rem !custom',
		minWidth: '0',
	})
}
