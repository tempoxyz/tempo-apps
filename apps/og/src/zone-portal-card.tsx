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
	return (
		<AddressCard
			data={{
				address,
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
							...overview.assets.slice(0, 2).map((asset) => ({
								label: `${asset.symbol.slice(0, 16)} balance`,
								value: formatPortalBalance(asset.balance, asset.decimals),
							})),
							...(overview.assets.length > 2
								? [
										{
											label: 'Other assets',
											value: number.format(overview.assets.length - 2),
										},
									]
								: []),
						]
					: [],
			}}
		/>
	)
}
