import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { Address as AddressComp } from '#comps/Address.tsx'
import { CollapsibleSection } from '#comps/Contract.tsx'
import { getContractInfo } from '#lib/domain/contracts.ts'
import { getApiUrl } from '#lib/env.ts'
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right'

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
	const [rolesExpanded, setRolesExpanded] = React.useState(true)

	const { data: metadataData } = useQuery<{
		createdTimestamp: number | null
		createdTxHash: `0x${string}` | null
		createdBy: Address.Address | null
	}>({
		queryKey: ['address-metadata', address],
		queryFn: async () => {
			const url = getApiUrl(`/api/address/metadata/${address}`)
			const response = await fetch(url)
			if (!response.ok)
				return {
					createdTimestamp: null,
					createdTxHash: null,
					createdBy: null,
				} as const
			return response.json()
		},
	})

	const { data: tip20Data } = useQuery<{
		roles: Array<{
			role: string
			roleHash: string
			account: Address.Address
			grantedAt?: number
			grantedTx?: `0x${string}`
		}>
		config: {
			supplyCap: string | null
			currency: string | null
			transferPolicyId: string | null
			paused: boolean | null
		}
	}>({
		queryKey: ['tip20-data', address, chainId],
		queryFn: async () => {
			const url = getApiUrl(
				'/api/tip20-roles',
				new URLSearchParams({
					address,
					chainId: String(chainId),
				}),
			)
			const response = await fetch(url)
			if (!response.ok)
				return {
					roles: [],
					config: {
						supplyCap: null,
						currency: null,
						transferPolicyId: null,
						paused: null,
					},
				}
			return response.json()
		},
	})

	const roles = tip20Data?.roles
	const config = tip20Data?.config

	return (
		<div className="flex flex-col [&>*:last-child]:border-b-transparent">
			{/* Info Banner */}
			<div className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px] px-[16px] py-[10px] text-[13px] text-secondary border-b border-dashed border-distinct">
				<span className="whitespace-nowrap">TIP-20 Native Token</span>
				<span className="text-tertiary">·</span>
				<a
					href="https://docs.tempo.xyz/protocol/tip20/spec#tip20-1"
					target="_blank"
					rel="noopener noreferrer"
					className="text-accent hover:underline whitespace-nowrap"
				>
					Spec
				</a>
				<a
					href="https://github.com/tempoxyz/tempo/blob/main/tips/ref-impls/src/TIP20.sol"
					target="_blank"
					rel="noopener noreferrer"
					className="text-accent hover:underline whitespace-nowrap"
				>
					Solidity
				</a>
				<a
					href="https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/tip20"
					target="_blank"
					rel="noopener noreferrer"
					className="text-accent hover:underline whitespace-nowrap"
				>
					Rust
				</a>
			</div>

			{/* Configuration Section */}
			<CollapsibleSection
				first
				title="Configuration"
				expanded={configExpanded}
				onToggle={() => setConfigExpanded(!configExpanded)}
			>
				<div className="px-[18px] py-[12px]">
					<div className="flex flex-col gap-[8px] text-[13px]">
						<ConfigRow
							label="Supply Cap"
							value={config?.supplyCap ?? undefined}
						/>
						<ConfigRow label="Currency" value={config?.currency ?? undefined} />
						<ConfigRow
							label="Transfer Policy ID"
							value={config?.transferPolicyId ?? undefined}
						/>
						<ConfigRow
							label="Paused"
							value={
								config?.paused !== null && config?.paused !== undefined
									? config.paused
										? 'Yes'
										: 'No'
									: undefined
							}
						/>
						<ConfigRow
							label="Created"
							value={
								metadataData?.createdTimestamp
									? formatDate(metadataData.createdTimestamp)
									: undefined
							}
						/>
						{metadataData?.createdBy && (
							<div className="flex items-center justify-between gap-[12px]">
								<span className="text-secondary">Created By</span>
								<AddressComp
									address={metadataData.createdBy}
									className="text-[13px]"
								/>
							</div>
						)}
						{metadataData?.createdTxHash && (
							<div className="flex items-center justify-between gap-[12px]">
								<span className="text-secondary">Creation Tx</span>
								<Link
									to="/tx/$hash"
									params={{ hash: metadataData.createdTxHash }}
									className="text-[13px] font-mono text-accent hover:underline"
								>
									{metadataData.createdTxHash.slice(0, 10)}…
									{metadataData.createdTxHash.slice(-8)}
								</Link>
							</div>
						)}
					</div>
				</div>
			</CollapsibleSection>

			{/* Roles Section */}
			<CollapsibleSection
				title="Roles"
				expanded={rolesExpanded}
				onToggle={() => setRolesExpanded(!rolesExpanded)}
			>
				<div className="px-[18px] py-[12px]">
					{roles && roles.length > 0 ? (
						<div className="flex flex-col gap-[8px] text-[13px]">
							{roles.map((r) => {
								const info = getContractInfo(r.account)
								const label = info?.name
								return (
									<div
										key={`${r.role}:${r.account}`}
										className="flex items-center gap-[8px]"
									>
										<span className="text-secondary shrink-0">{r.role}</span>
										{label && (
											<span className="text-[11px] text-tertiary shrink-0">
												{label}
											</span>
										)}
										<span className="min-w-0 flex-1">
											<AddressComp
												address={r.account}
												className="text-[12px]"
												align="end"
											/>
										</span>
										{r.grantedAt && (
											<span className="text-[11px] text-tertiary whitespace-nowrap hidden sm:inline">
												{formatDate(r.grantedAt)}
											</span>
										)}
										{r.grantedTx && (
											<Link
												to="/tx/$hash"
												params={{ hash: r.grantedTx }}
												className="text-[11px] text-accent hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-[2px]"
											>
												Grant <ArrowUpRightIcon className="size-[10px]" />
											</Link>
										)}
									</div>
								)
							})}
						</div>
					) : (
						<span className="text-[13px] text-tertiary">No roles found.</span>
					)}
				</div>
			</CollapsibleSection>
		</div>
	)
}

function ConfigRow(props: { label: string; value: string | undefined }) {
	return (
		<div className="flex items-center justify-between gap-[12px]">
			<span className="text-secondary">{props.label}</span>
			<span className="text-primary">
				{props.value ?? <span className="text-tertiary">&mdash;</span>}
			</span>
		</div>
	)
}

export declare namespace Tip20TokenTabContent {
	type Props = {
		address: Address.Address
	}
}
