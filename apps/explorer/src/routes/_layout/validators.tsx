import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from 'midcut'
import { Sections } from '#comps/Sections'
import { cx } from '#lib/css'
import { useMediaQuery } from '#lib/hooks'
import { withLoaderTiming } from '#lib/profiling'
import { validatorsQueryOptions } from '#lib/queries'

function ValidatorName({ name }: { name?: string }): React.JSX.Element {
	if (!name) return <span className="text-tertiary">—</span>
	return (
		<span className="text-[13px] text-primary font-sans whitespace-nowrap">
			{name}
		</span>
	)
}

function Toggle({
	checked,
	onChange,
	label,
}: {
	checked: boolean
	onChange: (next: boolean) => void
	label: string
}): React.JSX.Element {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
			className="flex items-center gap-[8px] cursor-pointer select-none text-[12px] text-secondary press-down"
		>
			<span>{label}</span>
			<span
				className={cx(
					'relative h-[16px] w-[28px] rounded-full transition-colors',
					checked ? 'bg-accent' : 'bg-base-alt border border-base-border',
				)}
			>
				<span
					className={cx(
						'absolute top-[1px] size-[12px] rounded-full bg-white shadow-sm transition-transform',
						checked ? 'translate-x-[13px]' : 'translate-x-[1px]',
					)}
				/>
			</span>
		</button>
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

function ValidatorsPage(): React.JSX.Element {
	const loaderData = Route.useLoaderData()

	const { data: validators, isPending } = useQuery({
		...validatorsQueryOptions(),
		initialData: loaderData,
	})

	const [showInactive, setShowInactive] = React.useState(false)

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	const activeCount = validators?.filter((v) => v.active).length ?? 0
	const totalCount = validators?.length ?? 0

	const filteredValidators = React.useMemo(() => {
		if (!validators) return []
		return showInactive ? validators : validators.filter((v) => v.active)
	}, [validators, showInactive])

	const columns: DataGrid.Column[] = [
		{
			label: <span className="font-mono">#</span>,
			align: 'start',
			width: 40,
			minWidth: 40,
		},
		{ label: 'Name', align: 'start', minWidth: 100 },
		{ label: 'Address', align: 'start', width: 160, minWidth: 120 },
		{ label: 'Status', align: 'start', width: 110, minWidth: 80 },
		{ label: 'Public Key', align: 'start', width: 200, minWidth: 120 },
	]

	const stackedColumns: DataGrid.Column[] = [
		{ label: 'Name', align: 'start', minWidth: 80 },
		{ label: 'Status', align: 'start', minWidth: 60 },
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-8 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-col gap-2 ml-2">
				<h1 className="font-heading text-[32px] leading-none tracking-[-0.02em] font-normal text-primary">
					Validators
				</h1>
				<p className="text-sm text-tertiary">
					Active validators securing the Tempo network.
				</p>
			</div>
			<Sections
				mode={mode}
				sections={[
					{
						totalItems: `${activeCount}/${totalCount} active`,
						itemsLabel: 'validators',
						autoCollapse: false,
						contextual: (
							<Toggle
								checked={showInactive}
								onChange={setShowInactive}
								label="Show inactive"
							/>
						),
						content: (
							<DataGrid
								columns={{ stacked: stackedColumns, tabs: columns }}
								items={() =>
									filteredValidators.map((validator, index) => ({
										cells: [
											<span
												key="index"
												className="tabular-nums font-mono text-tertiary"
											>
												{index + 1}
											</span>,
											<ValidatorName key="name" name={validator.name} />,
											<Address
												key="address"
												address={validator.validatorAddress}
												chars={6}
											/>,
											<span
												key="status"
												className="inline-flex items-center gap-[6px] text-tertiary font-sans"
											>
												<span
													className={cx(
														'size-[6px] rounded-full',
														validator.active
															? 'bg-positive animate-pulse'
															: 'bg-negative/60',
													)}
												/>
												{validator.active ? 'Active' : 'Inactive'}
											</span>,
											validator.publicKey ? (
												<Midcut
													key="pubkey"
													value={validator.publicKey}
													prefix="0x"
													min={6}
													align="start"
												/>
											) : (
												<span key="pubkey" className="text-tertiary">
													—
												</span>
											),
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
