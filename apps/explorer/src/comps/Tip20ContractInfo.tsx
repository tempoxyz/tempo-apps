import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address } from 'ox'
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
						<p role="status" {...styles.unavailable()}>
							Token configuration unavailable.{' '}
							<button
								type="button"
								onClick={() => void query.refetch()}
								{...cx(link(), linkHover())}
							>
								Try again
							</button>
						</p>
					)}
					<section aria-label="Metadata" {...styles.metadata()}>
						<h3 {...styles.metadataTitle()}>Metadata</h3>
						<dl {...styles.metadataFields()}>
							<MetadataField label="Currency" value={config?.currency} />
							<MetadataField label="Decimals" value={config?.decimals} />
							<MetadataField label="Total supply" value={config?.totalSupply} />
							<MetadataField label="Supply cap" value={config?.supplyCap} />
						</dl>
						<div {...styles.metadataRows()}>
							<ConfigRow
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
								<ConfigRow
									label="Created by"
									value={
										<AddressComp
											address={metadataData.createdBy}
											className={styles.createdBy().className}
										/>
									}
								/>
							)}
						</div>
					</section>
					<TokenTrust
						address={address}
						roles={query.data?.roles ?? []}
						loading={query.isPending}
						unavailable={query.isError || Boolean(query.data?.rolesUnavailable)}
						onRetry={() => void query.refetch()}
					/>
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

function ConfigRow(props: {
	label: string
	value: React.ReactNode
}): React.JSX.Element {
	return (
		<div {...styles.configRow()}>
			<span {...styles.configLabel()}>{props.label}</span>
			<span {...styles.configValue()}>
				{props.value ?? <span {...styles.tertiary()}>&mdash;</span>}
			</span>
		</div>
	)
}

function MetadataField(props: {
	label: string
	value: React.ReactNode
}): React.JSX.Element {
	return (
		<div {...styles.field()}>
			<dt {...styles.fieldLabel()}>{props.label}</dt>
			<dd {...styles.fieldValue()}>
				{props.value ?? <span {...styles.tertiary()}>&mdash;</span>}
			</dd>
		</div>
	)
}

export declare namespace Tip20TokenTabContent {
	type Props = { address: Address.Address }
}

namespace styles {
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
		typography: 'body.b3',
	})

	export const unavailable = style({
		color: 'content.tertiary',
		paddingBottom: '12',
	})

	export const metadata = style({
		borderColor: 'line.secondary',
		borderRadius: '2xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		overflow: 'hidden',
	})

	export const metadataTitle = style({
		borderBottomColor: 'line.secondary',
		borderBottomStyle: 'solid',
		borderBottomWidth: 'regular',
		paddingBlock: '12',
		paddingInline: '12',
		typography: 'body.b3Strong',
	})

	export const metadataFields = style({
		display: 'grid',
		gap: '16',
		gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
		padding: '12',
		'@media (width >= 1024px)': {
			gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
		},
	})

	export const metadataRows = style({
		borderTopColor: 'line.secondary',
		borderTopStyle: 'dashed',
		borderTopWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		padding: '12',
		typography: 'body.b3',
	})

	export const created = style({
		alignItems: 'center',
		columnGap: '12',
		display: 'flex',
		flexWrap: 'wrap',
		rowGap: '4',
	})

	export const createdBy = style({ typography: 'mono.inline' })

	export const footer = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		gap: '12',
		paddingBlock: '12',
		paddingInline: '20',
		typography: 'body.b3',
	})

	export const configRow = style({
		alignItems: 'baseline',
		columnGap: '12',
		display: 'flex',
		flexWrap: 'wrap',
		rowGap: '4',
	})

	export const configLabel = style({
		color: 'content.secondary',
		flexShrink: '0 !custom',
	})

	export const configValue = style({
		color: 'content.primary',
		minWidth: '0 !custom',
	})

	export const tertiary = style({ color: 'content.tertiary' })

	export const field = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const fieldLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const fieldValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		overflowWrap: 'anywhere',
		typography: 'body.b2',
	})
}
