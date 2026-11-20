import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Address } from 'viem'
import { Address as AddressComp } from '#comps/Address.tsx'
import { CollapsibleSection } from '#comps/Contract.tsx'
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

function formatDate(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

/** The address page's Earn tab, laid out like its Token tab. */
export function EarnVaultTabContent(
	props: EarnVaultTabContent.Props,
): React.JSX.Element {
	const { vault, address } = props
	const [expanded, setExpanded] = React.useState(true)
	const isEngine = vault.address !== address.toLowerCase()
	return (
		<CollapsibleSection
			first
			title={isEngine ? 'Earn engine' : 'Earn vault'}
			expanded={expanded}
			onToggle={() => setExpanded(!expanded)}
		>
			<div className="px-[18px] pb-[14px] pt-[6px] copy-13">
				{isEngine && (
					<p className="text-tertiary pb-3">
						This contract is the engine of a Tempo Earn vault.
					</p>
				)}
				<section
					aria-label="Vault"
					className="rounded-[6px] border border-distinct overflow-hidden"
				>
					<h3 className="border-b border-distinct px-3 py-2.5 font-medium">
						Vault
					</h3>
					<dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-3">
						<Field label="Asset" value={vault.asset.symbol} />
						<Field label="Engine" value={engineLabels[vault.engine]} />
						<Field
							label="TVL"
							value={
								vault.tvl === null
									? undefined
									: PriceFormatter.format(vault.tvl, { format: 'short' })
							}
						/>
						<Field
							label="Deposits"
							value={vault.depositsPaused ? 'Paused' : 'Open'}
						/>
					</dl>
					<div className="flex flex-col gap-2 border-t border-dashed border-distinct p-3 label-12">
						<Row
							label="Registry"
							value={vault.verified ? 'Verified' : 'Unverified'}
						/>
						{isEngine ? (
							<Row
								label="Vault"
								value={
									<AddressComp address={vault.address} className="label-12" />
								}
							/>
						) : (
							vault.engineAddress && (
								<Row
									label="Engine contract"
									value={
										<AddressComp
											address={vault.engineAddress}
											className="label-12"
										/>
									}
								/>
							)
						)}
						{vault.venue && (
							<Row
								label="Venue"
								value={
									<AddressComp address={vault.venue} className="label-12" />
								}
							/>
						)}
						{vault.deployment && (
							<>
								<Row
									label="Deployed"
									value={
										<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
											<span>{formatDate(vault.deployment.timestamp)}</span>
											<Link
												to="/block/$id"
												params={{ id: String(vault.deployment.block) }}
												className="text-accent hover:underline"
											>
												Block {vault.deployment.block.toLocaleString('en-US')}
											</Link>
										</span>
									}
								/>
								<Row
									label="Factory"
									value={
										<AddressComp
											address={vault.deployment.factory}
											className="label-12"
										/>
									}
								/>
							</>
						)}
					</div>
				</section>
				<Link
					to="/earn/$vault"
					params={{ vault: vault.address }}
					className="mt-4 inline-flex items-center gap-2 text-accent hover:underline"
				>
					View Earn vault →
				</Link>
			</div>
		</CollapsibleSection>
	)
}

export function Field(props: Field.Props): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1 min-w-0">
			<dt className="label-12 text-tertiary">{props.label}</dt>
			<dd className="text-primary tabular-nums">
				{props.value ?? <span className="text-tertiary">&mdash;</span>}
			</dd>
		</div>
	)
}

export function Row(props: Row.Props): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<span className="text-secondary shrink-0">{props.label}</span>
			<span className="text-primary min-w-0">{props.value}</span>
		</div>
	)
}

export declare namespace EarnVaultTabContent {
	type Props = { vault: EarnVault; address: Address }
}

export declare namespace Field {
	type Props = { label: string; value: React.ReactNode | undefined }
}

export declare namespace Row {
	type Props = { label: string; value: React.ReactNode }
}
