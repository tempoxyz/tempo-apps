import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { Address as AddressComp } from '#comps/Address.tsx'
import { CollapsibleSection } from '#comps/Contract.tsx'
import { TokenFeeAmm } from '#comps/FeeAmmPools'
import { TokenTrust } from '#comps/TokenTrust'
import { getApiUrl } from '#lib/env.ts'
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
	const [liquidityExpanded, setLiquidityExpanded] = React.useState(false)
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
		<div className="flex flex-col [&>*:last-child]:border-b-transparent">
			<CollapsibleSection
				first
				title="Token configuration"
				expanded={configExpanded}
				onToggle={() => setConfigExpanded(!configExpanded)}
			>
				<div className="px-[18px] pb-[14px] pt-[6px] text-[13px]">
					{query.isError && (
						<p role="status" className="text-tertiary pb-3">
							Token configuration unavailable.{' '}
							<button
								type="button"
								onClick={() => void query.refetch()}
								className="text-accent hover:underline"
							>
								Try again
							</button>
						</p>
					)}
					<div className="flex flex-col gap-[8px]">
						<ConfigRow label="Total supply" value={config?.totalSupply} />
						<ConfigRow label="Supply cap" value={config?.supplyCap} />
						<ConfigRow label="Currency" value={config?.currency} />
						<ConfigRow label="Decimals" value={config?.decimals} />
						<ConfigRow
							label="Created"
							value={
								metadataData?.createdTimestamp != null
									? formatDate(metadataData.createdTimestamp)
									: undefined
							}
						/>
						{metadataData?.createdBy && (
							<ConfigRow
								label="Created by"
								value={
									<AddressComp
										address={metadataData.createdBy}
										className="text-[12px]"
									/>
								}
							/>
						)}
						{metadataData?.createdTxHash && (
							<ConfigRow
								label="Creation tx"
								value={
									<Link
										to="/tx/$hash"
										params={{ hash: metadataData.createdTxHash }}
										className="text-accent hover:underline"
									>
										View transaction ↗
									</Link>
								}
							/>
						)}
					</div>
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
			<div className="flex items-center gap-3 px-[18px] py-[10px] text-[12px] text-tertiary">
				<span>TIP-20</span>
				<a
					href="https://tempo.xyz/developers/docs/protocol/tip20/spec/#tip20"
					target="_blank"
					rel="noopener noreferrer"
					className="text-accent hover:underline"
				>
					Spec
				</a>
				<a
					href="https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/tip20"
					target="_blank"
					rel="noopener noreferrer"
					className="text-accent hover:underline"
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
		<div className="flex items-center justify-between gap-[12px]">
			<span className="text-secondary shrink-0">{props.label}</span>
			<span className="text-primary min-w-0">
				{props.value ?? <span className="text-tertiary">&mdash;</span>}
			</span>
		</div>
	)
}

export declare namespace Tip20TokenTabContent {
	type Props = { address: Address.Address }
}
