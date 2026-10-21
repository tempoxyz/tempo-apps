import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	rootRouteId,
} from '@tanstack/react-router'
import { Calendar } from '@tempoxyz/ds/icons'
import * as React from 'react'
import { InfoCard } from '#comps/InfoCard'
import { NotFound } from '#comps/NotFound'
import { useAnimatedBlockNumber } from '#lib/block-number'
import { withLoaderTiming } from '#lib/profiling'
import { blocksQueryOptions } from '#lib/queries'
import { link, linkHover } from '#styles/explorer'
import { style } from '@tempoxyz/ds'

const AVERAGE_BLOCK_TIME_SECONDS = 0.5

// Explorer link color and hover underline, for route styles that cannot use `cx`.
const linkClassName = link({ className: linkHover().className }).className

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
					<span {...styles.target({ className: link().className })}>
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
								{...styles.blockLink({ className: linkClassName })}
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
								{...styles.blockLink({ className: linkClassName })}
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
								<Calendar {...styles.dateIcon()} />
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

namespace styles {
	export const page = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		gap: '32',
		justifyContent: 'center',
		minHeight: 'calc(100vh - 200px) !custom',
		paddingBottom: '64',
		paddingInline: '16',
		paddingTop: '64',
		width: '100% !custom',
	})

	export const card = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		maxWidth: '600px !custom',
		width: '100% !custom',
	})

	export const heading = style({ textAlign: 'center' })

	export const title = style({
		color: 'foreground',
		marginBottom: '8',
		typography: 'heading.24.subtle',
	})

	export const description = style({
		color: 'gray.900',
		typography: 'copy.14',
	})

	export const target = style({ typography: 'label.12.mono' })

	export const units = style({
		display: 'grid',
		gap: '12',
		gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
		maxWidth: '400px !custom',
		width: '100% !custom',
	})

	export const blockLink = style({ fontVariantNumeric: 'tabular-nums' })

	export const remaining = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums',
	})

	export const dateLabel = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const dateIcon = style({ flexShrink: 0, height: '16', width: '16' })

	export const dateLabelLong = style({
		display: 'none',
		'@media (width >= 480px)': { display: 'inline' },
	})

	export const dateLabelShort = style({
		'@media (width >= 480px)': { display: 'none' },
	})

	export const unit = style({
		alignItems: 'center',
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: '12',
		borderStyle: 'solid',
		borderWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		padding: '12',
	})

	export const unitValue = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums',
		typography: 'heading.32.subtle',
	})

	export const unitLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const date = style({
		color: 'foreground',
		whiteSpace: 'nowrap',
	})

	export const dateLong = style({
		display: 'none',
		'@media (width >= 620px)': { display: 'inline' },
	})

	export const dateShort = style({
		'@media (width >= 620px)': { display: 'none' },
	})
}
