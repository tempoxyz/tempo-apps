import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type * as React from 'react'
import type { Address } from 'viem'
import { PriceFormatter } from '#lib/formatting'
import { useIsMounted } from '#lib/hooks'
import { vaultsQueryOptions } from '#lib/queries/vaults'
import { engineLabels, kindLabels, type Vault } from '#lib/vaults'

/** The vault an address is, or is the Earn engine of. */
export function useVaultForAddress(address: Address): Vault | undefined {
	const isMounted = useIsMounted()
	const lower = address.toLowerCase()
	const { data } = useQuery({
		...vaultsQueryOptions(),
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

/** The tab header's link to the vault's page. */
export function VaultPageLink(props: VaultPageLink.Props): React.JSX.Element {
	return (
		<Link
			to="/vaults/$vault"
			params={{ vault: props.vault.address }}
			className="copy-13 text-accent hover:underline whitespace-nowrap"
		>
			View vault →
		</Link>
	)
}

/** The address page's Vault tab: one flat list of the vault's facts. */
export function VaultTabContent(
	props: VaultTabContent.Props,
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
		{ label: 'Kind', value: kindLabels[vault.kind] },
		...(vault.engine
			? [{ label: 'Engine', value: engineLabels[vault.engine] }]
			: []),
		{
			label: 'TVL',
			value:
				vault.tvl === null
					? '—'
					: PriceFormatter.format(vault.tvl, { format: 'short' }),
		},
		...(vault.kind === 'earn'
			? [{ label: 'Deposits', value: vault.depositsPaused ? 'Paused' : 'Open' }]
			: []),
		{ label: 'Verified', value: vault.verified ? 'Yes' : 'No' },
	]
	if (!isEngine && vault.engineAddress)
		rows.push({
			label: 'Engine contract',
			value: <AddressLink address={vault.engineAddress} />,
		})
	if (vault.venue)
		rows.push({ label: 'Venue', value: <AddressLink address={vault.venue} /> })
	if (vault.usedBy.length > 0)
		rows.push({
			label: 'Used by Earn vaults',
			value: <UsedBy users={vault.usedBy} />,
		})
	if (vault.deployment)
		rows.push({
			label: vault.kind === 'earn' ? 'Deployed' : 'First deposit',
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
		})
	if (vault.deployment?.factory)
		rows.push({
			label: 'Factory',
			value: <AddressLink address={vault.deployment.factory} />,
		})
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

export declare namespace VaultPageLink {
	type Props = { vault: Vault }
}

export declare namespace VaultTabContent {
	type Props = { vault: Vault; address: Address }
}

export declare namespace AddressLink {
	type Props = { address: `0x${string}` }
}

function UsedBy(props: { users: readonly `0x${string}`[] }): React.JSX.Element {
	const shown = props.users.slice(0, 5)
	const rest = props.users.length - shown.length
	return (
		<span className="flex flex-col items-end gap-1">
			{shown.map((user) => (
				<AddressLink key={user} address={user} />
			))}
			{rest > 0 && <span className="copy-13 text-tertiary">+{rest} more</span>}
		</span>
	)
}
