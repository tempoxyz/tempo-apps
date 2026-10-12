import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueue } from '../src/utils/queue'

describe('createQueue add()', () => {
	const original = Error.captureStackTrace

	afterEach(() => {
		Error.captureStackTrace = original
	})

	it('propagates the original rejection when Error.captureStackTrace is unavailable (Safari/iOS < 17.2, Firefox < 138)', async () => {
		// JavaScriptCore (older Safari + older iOS WebKit) and older SpiderMonkey
		// do not implement this V8-originated API. Simulate that runtime.
		// @ts-expect-error deliberately remove the method to emulate those engines
		Error.captureStackTrace = undefined

		const rpcError = new Error('execution reverted: insufficient balance')
		const queue = createQueue<never>({
			concurrency: 1,
			initialStart: true,
			worker: () => Promise.reject(rpcError),
		})

		// Must surface the real error, not a "captureStackTrace is not a function" TypeError.
		await expect(queue.add()).rejects.toBe(rpcError)
	})

	it('still enriches the stack when Error.captureStackTrace is available (V8)', async () => {
		const spy = vi.fn(original)
		Error.captureStackTrace = spy as typeof Error.captureStackTrace

		const rpcError = new Error('boom')
		const queue = createQueue<never>({
			concurrency: 1,
			initialStart: true,
			worker: () => Promise.reject(rpcError),
		})

		await expect(queue.add()).rejects.toBe(rpcError)
		expect(spy).toHaveBeenCalledWith(rpcError)
	})
})
