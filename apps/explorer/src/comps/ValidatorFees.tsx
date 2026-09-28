import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import type * as React from 'react'
import { formatUnits } from 'viem'
import { Sections } from '#comps/Sections'
import { useIsMounted } from '#lib/hooks'
import { validatorFeesQueryOptions } from '#lib/queries/validator-fees'

export function ValidatorFees(props: ValidatorFees.Props): React.JSX.Element {
	const { address, active } = props
	const isMounted = useIsMounted()
	const mode = Sections.useSectionsMode()
	const query = useQuery({
		...validatorFeesQueryOptions(address),
		enabled: isMounted && (active || mode === 'stacked'),
	})

	return (
		<div className="p-[16px] text-[13px]">
			<div className="flex items-start justify-between gap-4">
				<p className="text-secondary">
					Fees held in the FeeManager for this recipient, available to claim.
				</p>
				<button
					type="button"
					className="shrink-0 cursor-pointer text-accent disabled:opacity-50"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					{query.isFetching ? 'Refreshing…' : 'Refresh'}
				</button>
			</div>
			{query.isError ? (
				<p role="alert" className="mt-4 text-red-400">
					Unable to load all unclaimed fees. Please try refreshing.
				</p>
			) : !query.data ? (
				<p role="status" className="mt-4 text-tertiary">
					Loading unclaimed fees…
				</p>
			) : (
				<>
					<p className="mt-2 text-xs text-tertiary">
						As of indexed block{' '}
						<Link
							to="/block/$id"
							params={{ id: query.data.blockNumber }}
							className="text-accent"
						>
							{query.data.blockNumber}
						</Link>
					</p>
					{query.data.fees.length === 0 ? (
						<p className="mt-4 text-tertiary">
							No unclaimed fees at this block.
						</p>
					) : (
						<div className="mt-4 overflow-x-auto">
							<table className="w-full text-left">
								<thead className="text-tertiary">
									<tr>
										<th className="pb-3 font-normal">Token</th>
										<th className="pb-3 text-right font-normal">
											Unclaimed amount
										</th>
									</tr>
								</thead>
								<tbody>
									{query.data.fees.map((fee) => (
										<tr
											key={fee.token}
											className="border-t border-dashed border-card-border"
										>
											<td className="py-3 pr-4">
												<Link
													to="/address/$address"
													params={{ address: fee.token }}
													className="text-accent"
												>
													<span className="block">
														{fee.symbol ?? 'TIP-20'}
													</span>
													<span className="block break-all font-mono text-xs text-tertiary">
														{fee.token}
													</span>
												</Link>
											</td>
											<td className="py-3 text-right font-mono tabular-nums">
												{formatUnits(BigInt(fee.amount), 6)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
		</div>
	)
}

export declare namespace ValidatorFees {
	type Props = { address: Address.Address; active: boolean }
}
