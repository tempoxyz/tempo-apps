import { afterEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './timeout.js'

afterEach(() => vi.useRealTimers())

describe('withTimeout', () => {
	it('aborts fetch work and bounds bindings that ignore cancellation', async () => {
		vi.useFakeTimers()
		let signal: AbortSignal | undefined
		const result = withTimeout(async (value) => {
			signal = value
			return new Promise<never>(() => {})
		}, 20)
		const rejection = expect(result).rejects.toThrow(
			'Operation timed out after 20ms',
		)
		await vi.advanceTimersByTimeAsync(20)
		await rejection
		expect(signal?.aborted).toBe(true)
		expect(vi.getTimerCount()).toBe(0)
	})
	it('does not start work after its parent is aborted', async () => {
		const controller = new AbortController()
		controller.abort(new Error('source expired'))
		const operation = vi.fn()
		await expect(withTimeout(operation, 20, controller.signal)).rejects.toThrow(
			'source expired',
		)
		expect(operation).not.toHaveBeenCalled()
	})
	it('cleans up timers and listeners on success', async () => {
		vi.useFakeTimers()
		const controller = new AbortController()
		const remove = vi.spyOn(controller.signal, 'removeEventListener')
		await expect(
			withTimeout(async () => 42, 20, controller.signal),
		).resolves.toBe(42)
		expect(vi.getTimerCount()).toBe(0)
		expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
	})
})
