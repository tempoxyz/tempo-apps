import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { Sections } from '#comps/Sections'
import { useMediaQuery } from '#lib/hooks'
import { withLoaderTiming } from '#lib/profiling'
import { validatorsQueryOptions } from '#lib/queries'
import { getValidatorLabel } from '#lib/validators'
import Check from '~icons/lucide/check'
import X from '~icons/lucide/x'

function ValidatorName({ address }: { address: `0x${string}` }) {
	const name = getValidatorLabel(address)
	if (!name) return <span className="text-tertiary">—</span>
	return (
		<span className="text-[11px] px-[6px] py-[2px] rounded bg-base-alt/65 text-primary whitespace-nowrap">
			{name}
		</span>
	)
}

export const Route = createFileRoute('/_layout/validators')({
	component: ValidatorsPage,
	head: () => ({
		meta: [{ title: 'Validators – Tempo Explorer' }],
	}),
	loader: ({ context }) =>
		withLoaderTiming('/_layout/validators', async () =>
			context.queryClient.ensureQueryData(validatorsQueryOptions()),
		),
})

function ValidatorsPage() {
	const loaderData = Route.useLoaderData()

	const { data: validators, isPending } = useQuery({
		...validatorsQueryOptions(),
		initialData: loaderData,
	})

	const [hideInactive, setHideInactive] = React.useState(true)
	const hideInactiveId = React.useId()

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	const activeCount = validators?.filter((v) => v.active).length ?? 0
	const totalCount = validators?.length ?? 0

	const filteredValidators = React.useMemo(() => {
		if (!validators) return []
		return hideInactive ? validators.filter((v) => v.active) : validators
	}, [validators, hideInactive])

	const columns: DataGrid.Column[] = [
		{ label: 'Index', align: 'start', minWidth: 60 },
		{ label: 'Name', align: 'start', minWidth: 100 },
		{ label: 'Address', align: 'start', minWidth: 120 },
		{ label: 'Status', align: 'start', minWidth: 80 },
		{ label: 'Public Key', align: 'start', minWidth: 120 },
	]

	const stackedColumns: DataGrid.Column[] = [
		{ label: 'Index', align: 'start', minWidth: 50 },
		{ label: 'Name', align: 'start', minWidth: 80 },
		{ label: 'Status', align: 'start', minWidth: 60 },
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex items-center justify-end gap-2">
				<input
					id={hideInactiveId}
					type="checkbox"
					checked={hideInactive}
					onChange={(e) => setHideInactive(e.target.checked)}
					className="w-4 h-4 rounded border-base-border"
				/>
				<label
					htmlFor={hideInactiveId}
					className="text-sm text-secondary cursor-pointer select-none"
				>
					Hide inactive validators
				</label>
			</div>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Validators',
						totalItems: `${activeCount}/${totalCount} active`,
						itemsLabel: 'validators',
						autoCollapse: false,
						content: (
							<DataGrid
								columns={{ stacked: stackedColumns, tabs: columns }}
								items={() =>
									filteredValidators.map((validator) => ({
										cells: [
											<span
												key="index"
												className="tabular-nums text-secondary font-medium"
											>
												#{String(validator.index)}
											</span>,
											<ValidatorName
												key="name"
												address={validator.validatorAddress}
											/>,
											<Address
												key="address"
												address={validator.validatorAddress}
											/>,
											<span
												key="status"
												className={
													validator.active ? 'text-positive' : 'text-negative'
												}
											>
												{validator.active ? (
													<span className="inline-flex items-center gap-1">
														<Check className="size-3" />
														Active
													</span>
												) : (
													<span className="inline-flex items-center gap-1">
														<X className="size-3" />
														Inactive
													</span>
												)}
											</span>,
											<Midcut
												key="pubkey"
												value={validator.publicKey}
												prefix="0x"
											/>,
										],
										link: {
											href: `/address/${validator.validatorAddress}`,
											title: `View validator ${validator.validatorAddress}`,
										},
									}))
								}
								totalItems={filteredValidators.length}
								page={1}
								loading={isPending}
								itemsLabel="validators"
								itemsPerPage={filteredValidators.length || 10}
								emptyState="No validators found."
								pagination={false}
							/>
						),
					},
				]}
				activeSection={0}
			/>
		</div>
	)
}
