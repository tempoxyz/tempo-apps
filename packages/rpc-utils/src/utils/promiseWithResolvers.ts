// Adapted from https://github.com/ponder-sh/ponder/blob/main/packages/utils/src/utils/promiseWithResolvers.ts

export type PromiseWithResolvers<T = unknown> = {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (reason?: unknown) => void
}

export const promiseWithResolvers = <
	T = unknown,
>(): PromiseWithResolvers<T> => {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void

	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve
		reject = promiseReject
	})

	return { promise, resolve, reject }
}
