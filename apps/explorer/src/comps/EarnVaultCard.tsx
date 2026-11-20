import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type * as React from 'react'
import type { Address } from 'viem'
import { type EarnVault, engineLabels } from '#lib/earn'
import { PriceFormatter } from '#lib/formatting'
import { useIsMounted } from '#lib/hooks'
import { earnVaultsQueryOptions } from '#lib/queries/earn'

/** The Earn vault an address is, or is the engine of. */
export function useEarnVaultForAddress(
	address: Address,
): EarnVault | undefined {
	const isMounted = useIsMounted()
	const lower = address.toLowerCase()
	const { data } = useQuery({
		...earnVaultsQueryOptions(),
		enabled: isMounted,
		refetchInterval: false,
	})
	return data?.vaults.find(
		(item) => item.address === lower || item.engineAddress === lower,
	)
}

const date = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
})

/** The tab header's link to the vault's Earn page. */
export function EarnVaultLink(props: EarnVaultLink.Props): React.JSX.Element {
	return (
		<Link
			to="/earn/$vault"
			params={{ vault: props.vault.address }}
			className="copy-13 text-accent hover:underline whitespace-nowrap"
		>
			View Earn vault →
		</Link>
	)
}

/** The address page's Earn tab: one flat list of the vault's facts. */
export function EarnVaultTabContent(
	props: EarnVaultTabContent.Props,
): React.JSX.Element {
	const { vault, address } = props
	const isEngine = vault.address !== address.toLowerCase()
	const rows: { label: string; value: React.ReactNode }[] = [
		...(isEngine
			? [{ label: 'Engine of', value: <AddressLink address={vault.address} /> }]
			: []),
		{
			label: 'Asset',
			value: (
				<Link
					to="/token/$address"
					params={{ address: vault.asset.address }}
					className="text-accent hover:underline"
				>
					{vault.asset.symbol}
				</Link>
			),
		},
		{ label: 'Engine', value: engineLabels[vault.engine] },
		{
			label: 'TVL',
			value:
				vault.tvl === null
					? '—'
					: PriceFormatter.format(vault.tvl, { format: 'short' }),
		},
		{ label: 'Deposits', value: vault.depositsPaused ? 'Paused' : 'Open' },
		{ label: 'Registry', value: vault.verified ? 'Verified' : 'Unverified' },
	]
	if (!isEngine && vault.engineAddress)
		rows.push({
			label: 'Engine contract',
			value: <AddressLink address={vault.engineAddress} />,
		})
	if (vault.venue)
		rows.push({ label: 'Venue', value: <AddressLink address={vault.venue} /> })
	if (vault.deployment)
		rows.push(
			{
				label: 'Deployed',
				value: (
					<span className="inline-flex flex-wrap items-center gap-x-2">
						{date.format(vault.deployment.timestamp * 1000)}
						<Link
							to="/block/$id"
							params={{ id: String(vault.deployment.block) }}
							className="text-accent hover:underline tabular-nums"
						>
							Block {vault.deployment.block.toLocaleString('en-US')}
						</Link>
					</span>
				),
			},
			{
				label: 'Factory',
				value: <AddressLink address={vault.deployment.factory} />,
			},
		)
	return (
		<dl className="flex flex-col">
			{rows.map((row) => (
				<div
					key={row.label}
					className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-[18px] py-3.5 border-b last:border-b-0 border-dashed border-card-border"
				>
					<dt className="copy-14 text-tertiary">{row.label}</dt>
					<dd className="min-w-0 copy-14 text-primary">{row.value}</dd>
				</div>
			))}
		</dl>
	)
}

export function AddressLink(props: AddressLink.Props): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.address }}
			className="font-mono copy-13 text-accent hover:underline break-all"
		>
			{props.address}
		</Link>
	)
}

export declare namespace EarnVaultLink {
	type Props = { vault: EarnVault }
}

export declare namespace EarnVaultTabContent {
	type Props = { vault: EarnVault; address: Address }
}

export declare namespace AddressLink {
	type Props = { address: `0x${string}` }
}
