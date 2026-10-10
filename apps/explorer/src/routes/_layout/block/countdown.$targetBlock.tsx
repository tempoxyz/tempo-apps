import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	rootRouteId,
} from '@tanstack/react-router'
import * as React from 'react'
import { cx } from 'zyzz'
import { InfoCard } from '#comps/InfoCard'
import { NotFound } from '#comps/NotFound'
import { useAnimatedBlockNumber } from '#lib/block-number'
import { withLoaderTiming } from '#lib/profiling'
import { blocksQueryOptions } from '#lib/queries'
import { link, linkHover, pressDown } from '#styles/explorer'
import CalendarIcon from '~icons/lucide/calendar'
import { styles } from './-countdown.$targetBlock.styles'

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
		<div {...styles.page()}>
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
		<div {...styles.card()}>
			<div {...styles.heading()}>
				<h1 {...styles.title()}>Block Countdown</h1>
				<p {...styles.description()}>
					Estimated time for block{' '}
					<span {...cx(styles.target(), link())}>
						#{targetBlockNumber.toLocaleString()}
					</span>{' '}
					to be created
				</p>
			</div>

			<div {...styles.units()}>
				<CountdownUnit value={countdown.days} label="Days" />
				<CountdownUnit value={countdown.hours} label="Hours" />
				<CountdownUnit value={countdown.mins} label="Mins" />
				<CountdownUnit value={countdown.secs} label="Secs" />
			</div>

			<InfoCard
				sections={[
					{
						label: 'Target Block',
						value: (
							<Link
								to="/block/$id"
								params={{ id: String(targetBlockNumber) }}
								{...cx(styles.blockLink(), link(), linkHover(), pressDown())}
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
								{...cx(styles.blockLink(), link(), linkHover(), pressDown())}
							>
								#{currentBlockNumber.toLocaleString()}
							</Link>
						),
					},
					{
						label: 'Remaining Blocks',
						value: (
							<span {...styles.remaining()}>
								{remainingBlocks.toLocaleString()}
							</span>
						),
					},
					{
						label: (
							<span {...styles.dateLabel()} title="Estimated Target Date">
								<CalendarIcon {...styles.dateIcon()} />
								<span {...styles.dateLabelLong()}>Estimated Target Date</span>
								<span {...styles.dateLabelShort()}>Est. Target</span>
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
		<div {...styles.unit()}>
			<span {...styles.unitValue()}>{String(value).padStart(2, '0')}</span>
			<span {...styles.unitLabel()}>{label}</span>
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
		<span {...styles.date()} title={fullDate}>
			<span {...styles.dateLong()}>{fullDate}</span>
			<span {...styles.dateShort()}>{shortDate}</span>
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
