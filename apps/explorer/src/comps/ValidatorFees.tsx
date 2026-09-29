import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import type * as React from 'react'
import { formatUnits } from 'viem'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { useIsMounted } from '#lib/hooks'
import { validatorFeesQueryOptions } from '#lib/queries/validator-fees'

const columns: DataGrid.Column[] = [
	{ label: 'Token', align: 'start', width: '1fr' },
	{ label: 'Unclaimed amount', align: 'end', width: '1fr' },
]

export function ValidatorFees(props: ValidatorFees.Props): React.JSX.Element {
	const { address, active } = props
	const isMounted = useIsMounted()
	const mode = Sections.useSectionsMode()
	const query = useQuery({
		...validatorFeesQueryOptions(address),
		enabled: isMounted && (active || mode === 'stacked'),
	})

	if (query.isError)
		return (
			<p role="alert" className="p-[16px] text-[13px] text-red-400">
				Unable to load all unclaimed fees. Please reload the page to try again.
			</p>
		)

	const fees = query.data?.fees ?? []
	return (
		<>
			<DataGrid
				columns={{ stacked: columns, tabs: columns }}
				items={() =>
					fees.map((fee) => ({
						key: fee.token,
						cells: [
							<Link
								key="token"
								to="/address/$address"
								params={{ address: fee.token }}
								className="min-w-0 text-accent"
							>
								<span className="block">{fee.symbol ?? 'TIP-20'}</span>
								<span className="block break-all font-mono text-xs text-tertiary">
									{fee.token}
								</span>
							</Link>,
							<span key="amount" className="font-mono tabular-nums break-all">
								{formatUnits(BigInt(fee.amount), 6)}
							</span>,
						],
					}))
				}
				totalItems={fees.length}
				page={1}
				pagination={null}
				loading={!query.data}
				emptyState="No unclaimed fees."
			/>
			<p className="px-[16px] py-3 text-[13px] text-secondary">
				Fees held in the FeeManager for this recipient, available to claim.
			</p>
		</>
	)
}

export declare namespace ValidatorFees {
	type Props = { address: Address.Address; active: boolean }
}
