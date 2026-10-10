import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import type * as React from 'react'
import { useChainId } from 'wagmi'
import { Address as AddressComp } from '#comps/Address.tsx'
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
		<div className="flex flex-col copy-13">
			<section aria-label="Overview" className="px-[18px] py-5">
				<h2 className="heading-16 mb-4">Overview</h2>
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

				<dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
					<MetadataField label="Currency" value={config?.currency} />
					<MetadataField label="Decimals" value={config?.decimals} />
					<MetadataField label="Total supply" value={config?.totalSupply} />
					<MetadataField label="Supply cap" value={config?.supplyCap} />
				</dl>
				<div className="flex flex-col gap-2 mt-4 label-12">
					<ConfigRow
						label="Created"
						value={
							<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span>
									{metadataData?.createdTimestamp != null
										? formatDate(metadataData.createdTimestamp)
										: '—'}
								</span>
								{metadataData?.createdTxHash && (
									<Link
										to="/tx/$hash"
										params={{ hash: metadataData.createdTxHash }}
										className="text-accent hover:underline"
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
									className="label-12"
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
			<TokenFeeAmm address={address} />
		</div>
	)
}

function ConfigRow(props: {
	label: string
	value: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<span className="text-secondary shrink-0">{props.label}</span>
			<span className="text-primary min-w-0">
				{props.value ?? <span className="text-tertiary">&mdash;</span>}
			</span>
		</div>
	)
}

function MetadataField(props: {
	label: string
	value: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="min-w-0 flex flex-col gap-1.5">
			<dt className="label-12 text-secondary">{props.label}</dt>
			<dd className="copy-14 text-primary tabular-nums wrap-anywhere">
				{props.value ?? <span className="text-tertiary">&mdash;</span>}
			</dd>
		</div>
	)
}

export declare namespace Tip20TokenTabContent {
	type Props = { address: Address.Address }
}
