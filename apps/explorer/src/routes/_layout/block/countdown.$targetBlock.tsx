import {
	createFileRoute,
	Link,
	notFound,
	rootRouteId,
} from '@tanstack/react-router'
import * as React from 'react'
import { useWatchBlockNumber } from 'wagmi'
import { Breadcrumbs } from '#comps/Breadcrumbs'
import { InfoCard } from '#comps/InfoCard'
import { NotFound } from '#comps/NotFound'
import { cx } from '#lib/css'
import { withLoaderTiming } from '#lib/profiling'
import { blocksQueryOptions } from '#lib/queries'
import CalendarIcon from '~icons/lucide/calendar'
import CheckCircleIcon from '~icons/lucide/check-circle'
import ClockIcon from '~icons/lucide/clock'

const AVERAGE_BLOCK_TIME_SECONDS = 2
const MAX_ESTIMATED_SECONDS = 60 * 60 * 24 * 365 * 5 // 5 years cap

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

		return {
			targetBlockNumber: BigInt(parsedNumber),
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

	useWatchBlockNumber({
		onBlockNumber: (blockNumber) => {
			if (blockNumber == null) return
			setCurrentBlockNumber((prev) => (blockNumber > prev ? blockNumber : prev))
		},
		poll: true,
	})

	const isReached = currentBlockNumber >= targetBlockNumber
	const remainingBlocks = isReached
		? 0n
		: targetBlockNumber - currentBlockNumber

	const rawEstimatedSeconds =
		Number(remainingBlocks) * AVERAGE_BLOCK_TIME_SECONDS
	const estimatedSeconds = Math.min(rawEstimatedSeconds, MAX_ESTIMATED_SECONDS)
	const isCapped = rawEstimatedSeconds > MAX_ESTIMATED_SECONDS

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
			<Breadcrumbs className="w-full max-w-[600px]" />

			{isReached ? (
				<BlockReachedCard
					targetBlockNumber={targetBlockNumber}
					currentBlockNumber={currentBlockNumber}
				/>
			) : (
				<CountdownCard
					targetBlockNumber={targetBlockNumber}
					currentBlockNumber={currentBlockNumber}
					remainingBlocks={remainingBlocks}
					estimatedTargetDate={estimatedTargetDate}
					isCapped={isCapped}
				/>
			)}
		</div>
	)
}

function CountdownCard(props: {
	targetBlockNumber: bigint
	currentBlockNumber: bigint
	remainingBlocks: bigint
	estimatedTargetDate: Date
	isCapped: boolean
}) {
	const {
		targetBlockNumber,
		currentBlockNumber,
		remainingBlocks,
		estimatedTargetDate,
		isCapped,
	} = props

	const [countdown, setCountdown] = React.useState(() =>
		calculateCountdown(estimatedTargetDate),
	)

	React.useEffect(() => {
		const interval = setInterval(() => {
			setCountdown(calculateCountdown(estimatedTargetDate))
		}, 1000)
		return () => clearInterval(interval)
	}, [estimatedTargetDate])

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
							<span className="flex items-center gap-1.5">
								<CalendarIcon className="size-3.5 text-content-dimmed" />
								Estimated Target Date
							</span>
						),
						value: (
							<span className="text-primary">
								{estimatedTargetDate.toLocaleString('en-US', {
									weekday: 'short',
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit',
									second: '2-digit',
									timeZoneName: 'short',
								})}
							</span>
						),
					},
				]}
			/>

			<p className="text-tertiary text-xs text-center max-w-[400px]">
				{isCapped ? (
					<>
						Target block is very far in the future; date estimate capped at 5
						years.
					</>
				) : (
					<>
						Estimated time calculated using an average block time of{' '}
						{AVERAGE_BLOCK_TIME_SECONDS} seconds. Actual time may vary.
					</>
				)}
			</p>
		</div>
	)
}

function BlockReachedCard(props: {
	targetBlockNumber: bigint
	currentBlockNumber: bigint
}) {
	const { targetBlockNumber, currentBlockNumber } = props

	return (
		<div className="flex flex-col items-center gap-6 w-full max-w-[600px]">
			<div className="flex items-center justify-center size-20 rounded-full bg-positive/10">
				<CheckCircleIcon className="size-10 text-positive" />
			</div>

			<div className="text-center">
				<h1 className="text-2xl font-semibold text-primary mb-2">
					Block Created!
				</h1>
				<p className="text-secondary text-sm">
					Block{' '}
					<span className="text-accent font-mono">
						#{targetBlockNumber.toLocaleString()}
					</span>{' '}
					has been created and added to the blockchain.
				</p>
			</div>

			<InfoCard
				titlePosition="outside"
				className="w-full"
				title={
					<div className="px-[18px] py-[12px] flex items-center gap-2 text-tertiary">
						<CheckCircleIcon className="size-4 text-positive" />
						<span className="text-[13px]">Block Details</span>
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
						label: 'Blocks Since',
						value: (
							<span className="text-positive tabular-nums">
								+{(currentBlockNumber - targetBlockNumber).toLocaleString()}
							</span>
						),
					},
				]}
			/>

			<Link
				to="/block/$id"
				params={{ id: String(targetBlockNumber) }}
				className="px-4 py-2 bg-accent text-inverse rounded-lg hover:bg-accent/90 press-down transition-colors"
			>
				View Block Details
			</Link>
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

function calculateCountdown(targetDate: Date) {
	const now = Date.now()
	const target = targetDate.getTime()
	const diff = Math.max(0, target - now)

	const totalSeconds = Math.floor(diff / 1000)
	const days = Math.floor(totalSeconds / (24 * 60 * 60))
	const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60))
	const mins = Math.floor((totalSeconds % (60 * 60)) / 60)
	const secs = totalSeconds % 60

	return { days, hours, mins, secs }
}
