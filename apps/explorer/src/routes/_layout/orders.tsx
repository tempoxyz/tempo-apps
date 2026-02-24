import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { DataGrid } from '#comps/DataGrid'
import { Midcut } from '#comps/Midcut'
import { Sections } from '#comps/Sections'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#comps/TimeFormat'
import { cx } from '#lib/css'
import { withLoaderTiming } from '#lib/profiling'
import {
	openOrdersQueryOptions,
	filledOrdersQueryOptions,
	ORDERS_PER_PAGE,
} from '#lib/queries/orders'
import Play from '~icons/lucide/play'

export const Route = createFileRoute('/_layout/orders')({
	component: OrdersPage,
	head: () => ({
		meta: [{ title: 'Orders – Signet Explorer' }],
	}),
	loader: ({ context }) =>
		withLoaderTiming('/_layout/orders', async () => {
			const [open, filled] = await Promise.all([
				context.queryClient.ensureQueryData(openOrdersQueryOptions()),
				context.queryClient.ensureQueryData(filledOrdersQueryOptions()),
			])
			return { open, filled }
		}),
})

function OrdersPage() {
	const loaderData = Route.useLoaderData()
	const [live, setLive] = React.useState(true)
	const [paused, setPaused] = React.useState(false)
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()

	const { data: openOrders } = useQuery({
		...openOrdersQueryOptions(),
		initialData: loaderData?.open,
		enabled: live && !paused,
	})

	const { data: filledData } = useQuery({
		...filledOrdersQueryOptions(),
		initialData: loaderData?.filled,
	})

	const openColumns: DataGrid.Column[] = [
		{ label: 'Order', width: '2fr', minWidth: 100 },
		{ label: 'Details', width: '6fr' },
		{ align: 'end', label: 'Status', width: '1fr', minWidth: 80 },
	]

	const filledColumns: DataGrid.Column[] = [
		{ label: 'Tx Hash', width: '4fr', minWidth: 120 },
		{ label: 'Block', width: '1fr', minWidth: 80 },
		{
			align: 'end',
			label: (
				<TimeColumnHeader
					label="Time"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
				/>
			),
			width: '1fr',
			minWidth: 80,
		},
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-300 mx-auto w-full">
			<Sections
				mode="tabs"
				sections={[
					{
						title: 'Open Orders',
						totalItems: openOrders?.length || undefined,
						autoCollapse: false,
						contextual: (
							<button
								type="button"
								onClick={() => setLive(!live)}
								className={cx(
									'flex items-center gap-[4px] px-[6px] py-[2px] rounded-[4px] text-[11px] font-medium press-down cursor-pointer',
									live && !paused
										? 'bg-positive/10 text-positive hover:bg-positive/20'
										: 'bg-base-alt text-tertiary hover:bg-base-alt/80',
								)}
								title={
									live ? 'Pause live updates' : 'Resume live updates'
								}
							>
								{live && !paused ? (
									<>
										<span className="relative flex size-2">
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
											<span className="relative inline-flex rounded-full size-2 bg-positive" />
										</span>
										<span>Live</span>
									</>
								) : (
									<>
										<Play className="size-3" />
										<span>Paused</span>
									</>
								)}
							</button>
						),
						content: (
							// biome-ignore lint/a11y/noStaticElementInteractions: pause on hover
							<div
								onMouseEnter={() => setPaused(true)}
								onMouseLeave={() => setPaused(false)}
								onFocusCapture={() => setPaused(true)}
								onBlurCapture={(e) => {
									if (
										!e.currentTarget.contains(e.relatedTarget as Node)
									) {
										setPaused(false)
									}
								}}
							>
								<DataGrid
									columns={{
										stacked: openColumns,
										tabs: openColumns,
									}}
									items={() =>
										(openOrders ?? []).map((order, index) => ({
											cells: [
												<span
													key="id"
													className="tabular-nums text-accent font-medium"
												>
													#{index + 1}
												</span>,
												<span
													key="details"
													className="text-secondary text-[12px]"
												>
													{order.id ? (
														<Midcut
															value={String(order.id)}
															prefix=""
														/>
													) : (
														'—'
													)}
												</span>,
												<span
													key="status"
													className="text-warning tabular-nums"
												>
													Open
												</span>,
											],
										}))
									}
									totalItems={openOrders?.length ?? 0}
									page={1}
									loading={false}
									itemsLabel="open orders"
									itemsPerPage={ORDERS_PER_PAGE}
									emptyState="No open orders right now. Orders appear here when submitted and waiting to be filled."
									pagination={false}
								/>
							</div>
						),
					},
					{
						title: 'Filled Orders',
						totalItems: filledData?.orders.length || undefined,
						autoCollapse: false,
						content: (
							<DataGrid
								columns={{
									stacked: filledColumns,
									tabs: filledColumns,
								}}
								items={() =>
									(filledData?.orders ?? []).map((order) => ({
										cells: [
											<Midcut
												key="hash"
												value={order.transactionHash}
												prefix="0x"
											/>,
											<span
												key="block"
												className="tabular-nums text-accent font-medium"
											>
												#{order.blockNumber.toString()}
											</span>,
											<span
												key="time"
												className="text-secondary tabular-nums whitespace-nowrap"
											>
												{order.timestamp ? (
													<FormattedTimestamp
														timestamp={order.timestamp}
														format={timeFormat}
													/>
												) : (
													'—'
												)}
											</span>,
										],
										link: {
											href: `/receipt/${order.transactionHash}`,
											title: `View order ${order.transactionHash}`,
										},
									}))
								}
								totalItems={filledData?.orders.length ?? 0}
								page={1}
								loading={false}
								itemsLabel="filled orders"
								itemsPerPage={ORDERS_PER_PAGE}
								emptyState="No filled orders found on-chain yet."
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
