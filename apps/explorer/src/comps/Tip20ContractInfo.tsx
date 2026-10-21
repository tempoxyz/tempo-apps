import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Callout, Rows, style } from '@tempoxyz/ds'
import type { Address } from 'ox'
import { Addresses } from 'viem/tempo'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { cx } from 'zyzz'
import { Address as AddressComp } from '#comps/Address.tsx'
import { CollapsibleSection } from '#comps/Contract.tsx'
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
	const [configExpanded, setConfigExpanded] = React.useState(true)
	const [liquidityExpanded, setLiquidityExpanded] = React.useState(true)
	const { data: metadataData } = useQuery<{
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
			<CollapsibleSection
				first
				title="Token configuration"
				expanded={configExpanded}
				onToggle={() => setConfigExpanded(!configExpanded)}
			>
				<div {...styles.config()}>
					{query.isError && (
						<Callout
							intent="warning"
							role="status"
							size="small"
							{...styles.unavailable()}
						>
							<Callout.Icon />
							<Callout.Content>
								Token configuration unavailable.
							</Callout.Content>
							<Callout.Action onClick={() => void query.refetch()}>
								Try again
							</Callout.Action>
						</Callout>
					)}
					<section aria-label="Metadata">
						<h3 {...styles.metadataTitle()}>Metadata</h3>
						<Rows dividers="full">
							<MetadataRow label="Currency" value={config?.currency} />
							<MetadataRow label="Decimals" value={config?.decimals} />
							<MetadataRow label="Total supply" value={config?.totalSupply} />
							<MetadataRow label="Supply cap" value={config?.supplyCap} />
							<MetadataRow
								label="Created"
								value={
									<span {...styles.created()}>
										<span>
											{metadataData?.createdTimestamp != null
												? formatDate(metadataData.createdTimestamp)
												: '—'}
										</span>
										{metadataData?.createdTxHash && (
											<Link
												to="/tx/$hash"
												params={{ hash: metadataData.createdTxHash }}
												{...cx(link(), linkHover())}
											>
												Creation tx ↗
											</Link>
										)}
									</span>
								}
							/>
							{metadataData?.createdBy && (
								<MetadataRow
									label="Created by"
									value={
										<AddressComp
											address={metadataData.createdBy}
											className={styles.createdBy().className}
										/>
									}
								/>
							)}
						</Rows>
					</section>
					<TokenTrust
						address={address}
						roles={query.data?.roles ?? []}
						loading={query.isPending}
						unavailable={query.isError || Boolean(query.data?.rolesUnavailable)}
						onRetry={() => void query.refetch()}
					/>
					{address.toLowerCase() !== Addresses.pathUsd && (
						<Link
							to="/dex/$from/$to"
							params={{ from: address, to: Addresses.pathUsd }}
							{...cx(styles.dexRoute(), link(), linkHover())}
						>
							View Stablecoin DEX route →
						</Link>
					)}
				</div>
			</CollapsibleSection>
			<CollapsibleSection
				title="Fee AMM liquidity"
				expanded={liquidityExpanded}
				onToggle={() => setLiquidityExpanded(!liquidityExpanded)}
			>
				{liquidityExpanded && <TokenFeeAmm address={address} />}
			</CollapsibleSection>
			<div {...styles.footer()}>
				<span>TIP-20</span>
				<a
					href="https://tempo.xyz/developers/docs/protocol/tip20/spec/#tip20"
					target="_blank"
					rel="noopener noreferrer"
					{...cx(link(), linkHover())}
				>
					Spec
				</a>
				<a
					href="https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/tip20"
					target="_blank"
					rel="noopener noreferrer"
					{...cx(link(), linkHover())}
				>
					Rust
				</a>
			</div>
		</div>
	)
}

function MetadataRow(props: {
	label: string
	value: React.ReactNode
}): React.JSX.Element {
	return (
		<Rows.Row spacing="none">
			<Rows.Label>{props.label}</Rows.Label>
			<span {...styles.value()}>
				{props.value ?? <span {...styles.placeholder()}>&mdash;</span>}
			</span>
		</Rows.Row>
	)
}

export declare namespace Tip20TokenTabContent {
	type Props = { address: Address.Address }
}

namespace styles {
	export const dexRoute = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
		marginTop: '16',
	})

	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		selectors: {
			'& > *:last-child': { borderBottomColor: 'transparent !custom' },
		},
	})

	export const config = style({
		paddingBottom: '16',
		paddingInline: '20',
		paddingTop: '8',
		typography: 'label.12',
	})

	export const unavailable = style({ marginBottom: '16' })

	export const metadataTitle = style({
		paddingBottom: '8',
		typography: 'label.12.strong',
	})

	export const value = style({
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0',
		overflowWrap: 'anywhere',
		textAlign: 'end',
	})

	export const placeholder = style({ color: 'gray.900' })

	export const created = style({
		alignItems: 'center',
		columnGap: '12',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'flex-end',
		rowGap: '4',
	})

	export const createdBy = style({ typography: 'label.12.mono' })

	export const footer = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
		gap: '12',
		paddingBlock: '12',
		paddingInline: '20',
		typography: 'label.12',
	})
}
