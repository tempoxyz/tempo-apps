import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	rootRouteId,
} from '@tanstack/react-router'
import * as React from 'react'
import { InfoCard } from '#comps/InfoCard'
import { NotFound } from '#comps/NotFound'
import { useAnimatedBlockNumber } from '#lib/block-number'
import { blocksQueryOptions } from '#lib/queries'
import { link, linkHover } from '#styles/explorer'
import { style, Surface } from '@tempoxyz/ds'
import { cx } from 'zyzz'

const AVERAGE_BLOCK_TIME_SECONDS = 0.5

export const Route = createFileRoute('/_layout/block/countdown/$targetBlock')({
	component: RouteComponent,
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Invalid block number"
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

		const data = await context.queryClient.ensureQueryData(blocksQueryOptions())

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
				<h1 {...styles.title()}>Block countdown</h1>
				<p {...styles.description()}>
					Estimated time until block{' '}
					<span {...styles.target()}>
						{targetBlockNumber.toLocaleString('en-US')}
					</span>{' '}
					is created
				</p>
			</div>

			<dl aria-label="Time remaining" {...styles.units()}>
				<CountdownUnit value={countdown.days} label="Days" />
				<CountdownUnit value={countdown.hours} label="Hours" />
				<CountdownUnit value={countdown.mins} label="Minutes" />
				<CountdownUnit value={countdown.secs} label="Seconds" />
			</dl>

			<InfoCard
				sections={[
					{
						label: 'Target block',
						value: (
							<Link
								to="/block/$id"
								params={{ id: String(targetBlockNumber) }}
								{...cx(styles.numeric(), link(), linkHover())}
							>
								{targetBlockNumber.toLocaleString('en-US')}
							</Link>
						),
					},
					{
						label: 'Current block',
						value: (
							<Link
								to="/block/$id"
								params={{ id: String(currentBlockNumber) }}
								{...cx(styles.numeric(), link(), linkHover())}
							>
								{currentBlockNumber.toLocaleString('en-US')}
							</Link>
						),
					},
					{
						label: 'Remaining blocks',
						value: (
							<span {...styles.numeric()}>
								{remainingBlocks.toLocaleString('en-US')}
							</span>
						),
					},
					{
						label: 'Estimated date',
						value: <EstimatedTargetDateValue date={estimatedTargetDate} />,
					},
				]}
			/>
		</div>
	)
}

/** A countdown tile: the unit in a `dt`, the count in a `dd`. */
function CountdownUnit(props: { value: number; label: string }) {
	const { value, label } = props
	return (
		<Surface size="small" {...styles.unit()}>
			<dt {...styles.unitLabel()}>{label}</dt>
			<dd {...styles.unitValue()}>{String(value).padStart(2, '0')}</dd>
		</Surface>
	)
}

function EstimatedTargetDateValue(props: { date: Date }) {
	const { date } = props
	return (
		<time dateTime={date.toISOString()} {...styles.date()}>
			{date.toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				timeZoneName: 'short',
			})}
		</time>
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

	export const target = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums !custom',
	})

	export const units = style({
		display: 'grid',
		gap: '12',
		gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) !custom',
		margin: '0',
		maxWidth: '400px !custom',
		width: '100% !custom',
	})

	export const unit = style({ textAlign: 'center' })

	export const unitLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const unitValue = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'heading.32.subtle',
	})

	export const numeric = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums !custom',
	})

	export const date = style({
		color: 'foreground',
		textAlign: 'right',
	})
}
