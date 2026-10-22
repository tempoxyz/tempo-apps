import { AddressCard } from '#ui.tsx'
import {
	formatPortalBalance,
	portalId,
	type PortalOverview,
} from '#zone-portal.ts'

// Portal data uses the shared address card; it has no separate visual template.
export function ZonePortalCard({
	address,
	overview,
}: {
	address: string
	overview?: PortalOverview
}) {
	const number = new Intl.NumberFormat('en-US')
	const [asset, ...others] = overview?.assets ?? []
	return (
		<AddressCard
			data={{
				address,
				kind: 'Zone Portal',
				accountType: 'contract',
				contractName: `Zone Portal Proxy #${String(portalId(address))}`,
				holdings: '',
				txCount: '',
				lastActive: '',
				created: '',
				tokensHeld: [],
				contractDescription: overview
					? undefined
					: 'Data temporarily unavailable',
				details: overview
					? [
							{
								label: 'Deposits',
								value: number.format(overview.counts.deposits),
							},
							{
								label: 'Withdrawals',
								value: number.format(overview.counts.withdrawals),
							},
							{
								label: 'Batches',
								value: number.format(overview.counts.batches),
							},
							...(asset
								? [
										{
											label:
												others.length > 0
													? `Balance · ${others.length + 1} assets`
													: 'Balance',
											value: formatPortalBalance(asset.balance, asset.decimals),
											unit: asset.symbol.slice(0, 16),
										},
									]
								: []),
						]
					: [],
			}}
		/>
	)
}
