import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	rootRouteId,
} from '@tanstack/react-router'
import * as React from 'react'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { InfoCard } from '#comps/InfoCard'
import { NotFound } from '#comps/NotFound'
import { useAnimatedBlockNumber } from '#lib/block-number'
import { cx } from '#lib/css'
import { withLoaderTiming } from '#lib/profiling'
import { blocksQueryOptions } from '#lib/queries'
import CalendarIcon from '~icons/lucide/calendar'
import ClockIcon from '~icons/lucide/clock'

const AVERAGE_BLOCK_TIME_SECONDS = 0.5

export const Route = createFileRoute('/_layout/block/countdown/$targetBlock')({
	component: RouteComponent,
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Invalid Block Number"
			message="Please enter a valid block number for the countdown."
			data={data as NotFound.NotFoundData}
		/>
	),
	loader: async ({ params, context }) => {
		const { targetBlock } = params

		if (!/^\d+$/.test(targetBlock)) {
			throw notFound({
				routeId: rootRouteId,
				data: {
					error: 'Invalid block number. Please enter a non-negative integer.',
				},
			})
		}

		const parsedNumber = Number(targetBlock)
		if (!Number.isSafeInteger(parsedNumber) || parsedNumber < 0) {
			throw notFound({
				routeId: rootRouteId,
				data: {
					error: 'Invalid block number. Please enter a non-negative integer.',
				},
			})
		}

		const data = await withLoaderTiming(
			'/_layout/block/countdown/$targetBlock',
			() => context.queryClient.ensureQueryData(blocksQueryOptions()),
		)

		const targetBlockNumber = BigInt(parsedNumber)
		if (data.latestBlockNumber >= targetBlockNumber) {
			throw redirect({ to: '/block/$id', params: { id: targetBlock } })
		}

		return {
			targetBlockNumber,
			currentBlockNumber: data.latestBlockNumber,
		}
	},
})

function RouteComponent() {
	const loaderData = Route.useLoaderData()
	const [currentBlockNumber, setCurrentBlockNumber] = React.useState(
		loaderData.currentBlockNumber,
	)
	const targetBlockNumber = loaderData.targetBlockNumber
	const liveBlockNumber = useAnimatedBlockNumber(loaderData.currentBlockNumber)

	React.useEffect(() => {
		if (liveBlockNumber == null) return
		setCurrentBlockNumber((prev) =>
			liveBlockNumber > prev ? liveBlockNumber : prev,
		)
	}, [liveBlockNumber])

	const remainingBlocks = targetBlockNumber - currentBlockNumber

	const estimatedSeconds = Number(remainingBlocks) * AVERAGE_BLOCK_TIME_SECONDS

	const estimatedTargetDate = React.useMemo(() => {
		return new Date(Date.now() + estimatedSeconds * 1000)
	}, [estimatedSeconds])

	return (
		<div
			className={cx(
				'flex flex-col items-center justify-center gap-8 w-full min-h-[calc(100vh-200px)]',
				'pt-20 pb-16 px-4',
			)}
		>
			<BreadcrumbsSlot className="w-full max-w-[600px]" />
			<CountdownCard
				targetBlockNumber={targetBlockNumber}
				currentBlockNumber={currentBlockNumber}
				remainingBlocks={remainingBlocks}
				estimatedTargetDate={estimatedTargetDate}
			/>
		</div>
	)
}

function CountdownCard(props: {
	targetBlockNumber: bigint
	currentBlockNumber: bigint
	remainingBlocks: bigint
	estimatedTargetDate: Date
}) {
	const {
		targetBlockNumber,
		currentBlockNumber,
		remainingBlocks,
		estimatedTargetDate,
	} = props

	const [now, setNow] = React.useState(() => Date.now())

	React.useEffect(() => {
		const interval = setInterval(() => {
			setNow(Date.now())
		}, 1000)
		return () => clearInterval(interval)
	}, [])

	const countdown = React.useMemo(
		() => calculateCountdown(estimatedTargetDate, now),
		[estimatedTargetDate, now],
	)

	return (
		<div className="flex flex-col items-center gap-6 w-full max-w-[600px]">
			<div className="text-center">
				<h1 className="text-2xl font-semibold text-primary mb-2">
					Block Countdown
				</h1>
				<p className="text-secondary text-sm">
					Estimated time for block{' '}
					<span className="text-accent font-mono">
						#{targetBlockNumber.toLocaleString()}
					</span>{' '}
					to be created
				</p>
			</div>

			<div className="grid grid-cols-4 gap-3 w-full max-w-[400px]">
				<CountdownUnit value={countdown.days} label="Days" />
				<CountdownUnit value={countdown.hours} label="Hours" />
				<CountdownUnit value={countdown.mins} label="Mins" />
				<CountdownUnit value={countdown.secs} label="Secs" />
			</div>

			<InfoCard
				titlePosition="outside"
				className="w-full"
				title={
					<div className="px-[18px] py-[12px] flex items-center gap-2 text-tertiary">
						<ClockIcon className="size-4" />
						<span className="text-[13px]">Countdown Details</span>
					</div>
				}
				sections={[
					{
						label: 'Target Block',
						value: (
							<Link
								to="/block/$id"
								params={{ id: String(targetBlockNumber) }}
								className="text-accent hover:underline press-down tabular-nums"
							>
								#{targetBlockNumber.toLocaleString()}
							</Link>
						),
					},
					{
						label: 'Current Block',
						value: (
							<Link
								to="/block/$id"
								params={{ id: String(currentBlockNumber) }}
								className="text-accent hover:underline press-down tabular-nums"
							>
								#{currentBlockNumber.toLocaleString()}
							</Link>
						),
					},
					{
						label: 'Remaining Blocks',
						value: (
							<span className="text-primary tabular-nums">
								{remainingBlocks.toLocaleString()}
							</span>
						),
					},
					{
						label: (
							<span
								className="flex items-center gap-1.5"
								title="Estimated Target Date"
							>
								<CalendarIcon className="size-3.5 text-content-dimmed" />
								<span className="hidden min-[480px]:inline">
									Estimated Target Date
								</span>
								<span className="min-[480px]:hidden">Est. Target</span>
							</span>
						),
						value: <EstimatedTargetDateValue date={estimatedTargetDate} />,
					},
				]}
			/>
		</div>
	)
}

function CountdownUnit(props: { value: number; label: string }) {
	const { value, label } = props
	return (
		<div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-card border border-card-border">
			<span className="text-3xl font-mono font-semibold text-primary tabular-nums">
				{String(value).padStart(2, '0')}
			</span>
			<span className="text-xs text-tertiary uppercase tracking-wide">
				{label}
			</span>
		</div>
	)
}

function EstimatedTargetDateValue(props: { date: Date }) {
	const { date } = props

	const fullDate = date.toLocaleString('en-US', {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		timeZoneName: 'short',
	})

	const shortDate = date.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})

	return (
		<span className="text-primary whitespace-nowrap" title={fullDate}>
			<span className="hidden min-[620px]:inline">{fullDate}</span>
			<span className="min-[620px]:hidden">{shortDate}</span>
		</span>
	)
}

function calculateCountdown(targetDate: Date, now: number) {
	const target = targetDate.getTime()
	const diff = Math.max(0, target - now)

	const totalSeconds = Math.floor(diff / 1000)
	const days = Math.floor(totalSeconds / (24 * 60 * 60))
	const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60))
	const mins = Math.floor((totalSeconds % (60 * 60)) / 60)
	const secs = totalSeconds % 60

	return { days, hours, mins, secs }
}
