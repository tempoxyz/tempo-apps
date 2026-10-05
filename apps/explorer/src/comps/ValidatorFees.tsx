import { useQuery } from '@tanstack/react-query'
import type { Address } from 'ox'
import type * as React from 'react'
import {
	AssetName,
	AssetSymbol,
	AssetContract,
	AssetCurrency,
	AssetAmount,
	AssetValue,
} from '#comps/AssetCells'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { useIsMounted } from '#lib/hooks'
import { validatorFeesQueryOptions } from '#lib/queries/validator-fees'

const columns: Record<'stacked' | 'tabs', DataGrid.Column[]> = {
	stacked: [
		{ label: 'Name', align: 'start', width: '1fr' },
		{ label: 'Contract', align: 'start', width: '1fr' },
		{ label: 'Amount', align: 'end', width: '0.5fr' },
	],
	tabs: [
		{ label: 'Name', align: 'start', width: '1fr' },
		{ label: 'Ticker', align: 'start', width: '0.5fr' },
		{ label: 'Currency', align: 'start', width: '0.5fr' },
		{ label: 'Amount', align: 'end', width: '0.5fr' },
		{ label: 'Value', align: 'end', width: '0.5fr' },
	],
}

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
				columns={columns}
				items={(mode) =>
					fees.map((fee) => {
						const asset = {
							address: fee.token,
							metadata: {
								name: fee.name ?? fee.symbol ?? 'TIP-20',
								symbol: fee.symbol ?? undefined,
								currency: fee.currency ?? undefined,
								decimals: 6,
							},
							balance: BigInt(fee.amount),
							valuation: undefined,
						}
						return {
							key: fee.token,
							className: 'copy-13',
							cells:
								mode === 'stacked'
									? [
											<AssetName key="name" asset={asset} />,
											<AssetContract key="contract" asset={asset} />,
											<AssetAmount key="amount" asset={asset} />,
										]
									: [
											<AssetName key="name" asset={asset} />,
											<AssetSymbol key="symbol" asset={asset} />,
											<AssetCurrency key="currency" asset={asset} />,
											<AssetAmount key="amount" asset={asset} />,
											<AssetValue key="value" asset={asset} />,
										],
							link: {
								href: `/address/${fee.token}?tab=transfers` as const,
								search: { a: address },
								title: `View token ${fee.token}`,
							},
						}
					})
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
