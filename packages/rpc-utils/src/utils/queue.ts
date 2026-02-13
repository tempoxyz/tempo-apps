import {
	type PromiseWithResolvers,
	promiseWithResolvers,
} from './promiseWithResolvers'

// Adapted from https://github.com/ponder-sh/ponder/blob/main/packages/utils/src/utils/queue.ts

export type InnerQueue<ReturnType, TaskType> = {
	task: TaskType
	resolve: (arg: ReturnType) => void
	reject: (error: Error) => void
}[]

export type Queue<ReturnType, TaskType> = {
	size: () => number
	pending: () => Promise<number>
	add: (task: TaskType) => Promise<ReturnType>
	clear: () => void
	isStarted: () => boolean
	start: () => Promise<void>
	pause: () => void
	onIdle: () => Promise<void>
	onEmpty: () => Promise<void>
	setParameters: (
		parameters: Pick<
			CreateQueueParameters<unknown, unknown>,
			'frequency' | 'concurrency'
		>,
	) => void
}

export type CreateQueueParameters<ReturnType, TaskType> = {
	worker: (task: TaskType) => Promise<ReturnType>
	initialStart?: boolean
	browser?: boolean
} & (
	| {
			concurrency: number
			frequency: number
	  }
	| { concurrency: number; frequency?: undefined }
	| { concurrency?: undefined; frequency: number }
)

const validateParameters = ({
	concurrency,
	frequency,
}: Pick<
	CreateQueueParameters<unknown, unknown>,
	'frequency' | 'concurrency'
>) => {
	if (concurrency === undefined && frequency === undefined) {
		throw new Error(
			"Invalid queue configuration, must specify either 'concurrency' or 'frequency'.",
		)
	}

	if (concurrency !== undefined && concurrency <= 0) {
		throw new Error(
			`Invalid value for queue 'concurrency' option. Got ${concurrency}, expected a number greater than zero.`,
		)
	}

	if (frequency !== undefined && frequency <= 0) {
		throw new Error(
			`Invalid value for queue 'frequency' option. Got ${frequency}, expected a number greater than zero.`,
		)
	}
}

export const createQueue = <ReturnType, TaskType = void>({
	worker,
	initialStart = false,
	browser = true,
	..._parameters
}: CreateQueueParameters<ReturnType, TaskType>): Queue<
	ReturnType,
	TaskType
> => {
	validateParameters(_parameters)

	const parameters: Pick<
		CreateQueueParameters<unknown, unknown>,
		'frequency' | 'concurrency'
	> = _parameters
	let queue: InnerQueue<ReturnType, TaskType>[number][] = []
	let pending = 0
	let timestamp = 0
	let requests = 0
	let isStarted = initialStart
	let timer: NodeJS.Timeout | undefined
	let emptyPromiseWithResolvers:
		| (PromiseWithResolvers<void> & { completed: boolean })
		| undefined
	let idlePromiseWithResolvers:
		| (PromiseWithResolvers<void> & { completed: boolean })
		| undefined

	const next = () => {
		if (!isStarted) return

		const now = Date.now()

		if (Math.floor(now / 1_000) !== timestamp) {
			requests = 0
			timestamp = Math.floor(now / 1_000)
		}

		if (timer) return

		while (
			(parameters.frequency !== undefined
				? requests < parameters.frequency
				: true) &&
			(parameters.concurrency !== undefined
				? pending < parameters.concurrency
				: true) &&
			queue.length > 0
		) {
			const entry = queue.shift()

			if (!entry) return

			const { task, resolve, reject } = entry

			requests += 1
			pending += 1

			worker(task)
				.then(resolve)
				.catch(reject)
				.finally(() => {
					pending -= 1

					if (
						idlePromiseWithResolvers !== undefined &&
						queue.length === 0 &&
						pending === 0
					) {
						idlePromiseWithResolvers.resolve()
						idlePromiseWithResolvers.completed = true
					}

					if (browser) {
						next()
					} else {
						process.nextTick(next)
					}
				})

			if (emptyPromiseWithResolvers !== undefined && queue.length === 0) {
				emptyPromiseWithResolvers.resolve()
				emptyPromiseWithResolvers.completed = true
			}
		}

		if (
			parameters.frequency !== undefined &&
			requests >= parameters.frequency
		) {
			timer = setTimeout(
				() => {
					timer = undefined
					next()
				},
				1_000 - (now % 1_000),
			)
		}
	}

	return {
		size: () => queue.length,
		pending: () => {
			if (browser) {
				return new Promise((resolve) => setTimeout(() => resolve(pending)))
			}

			return new Promise((resolve) => setImmediate(() => resolve(pending)))
		},
		add: (task: TaskType) => {
			const { promise, resolve, reject } = promiseWithResolvers<ReturnType>()
			queue.push({ task, resolve, reject })

			next()

			return promise.catch((error) => {
				if (error instanceof Error) {
					Error.captureStackTrace(error)
				}

				throw error
			})
		},
		clear: () => {
			queue = [] as InnerQueue<ReturnType, TaskType>[number][]
			clearTimeout(timer)
			timer = undefined
		},
		isStarted: () => isStarted,
		start: () => {
			if (browser) {
				return new Promise<number>((resolve) =>
					setTimeout(() => resolve(pending)),
				).then(() => {
					isStarted = true
					next()
				})
			}

			return new Promise<number>((resolve) =>
				process.nextTick(() => resolve(pending)),
			).then(() => {
				isStarted = true
				next()
			})
		},
		pause: () => {
			isStarted = false
		},
		onIdle: () => {
			if (
				idlePromiseWithResolvers === undefined ||
				idlePromiseWithResolvers.completed
			) {
				if (queue.length === 0 && pending === 0) {
					return Promise.resolve()
				}

				idlePromiseWithResolvers = {
					...promiseWithResolvers<void>(),
					completed: false,
				}
			}

			return idlePromiseWithResolvers.promise
		},
		onEmpty: () => {
			if (
				emptyPromiseWithResolvers === undefined ||
				emptyPromiseWithResolvers.completed
			) {
				if (queue.length === 0) return Promise.resolve()

				emptyPromiseWithResolvers = {
					...promiseWithResolvers<void>(),
					completed: false,
				}
			}

			return emptyPromiseWithResolvers.promise
		},
		setParameters: (_nextParameters) => {
			validateParameters(_nextParameters)

			if ('frequency' in _nextParameters) {
				parameters.frequency = _nextParameters.frequency
			}

			if ('concurrency' in _nextParameters) {
				parameters.concurrency = _nextParameters.concurrency
			}
		},
	}
}
