import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyFeedbackEvent, createCopyController } from '../src/lib/clipboard'

function deferred() {
	let resolve = () => {}
	let reject = (_error: Error) => {}
	const promise = new Promise<void>((resolve_, reject_) => {
		resolve = resolve_
		reject = reject_
	})
	return { promise, resolve, reject }
}

function setup(write = async (_value: string) => {}) {
	const errors: boolean[] = []
	const controller = createCopyController(write, (failed) =>
		errors.push(failed),
	)
	return { controller, errors }
}

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe('clipboard feedback', () => {
	it.each([
		'',
		'0x1234',
		'Tempo café\nsecond line',
	])('preserves text %j and expires success', async (value) => {
		vi.useFakeTimers()
		let copied = 'not copied'
		const { controller, errors } = setup(async (text) => {
			copied = text
		})
		await controller.copy(value, 2000)
		expect(copied).toBe(value)
		expect(controller.getSnapshot()).toBe(true)
		expect(errors).toEqual([false])
		vi.advanceTimersByTime(1999)
		expect(controller.getSnapshot()).toBe(true)
		vi.advanceTimersByTime(1)
		expect(controller.getSnapshot()).toBe(false)
	})

	it.each([
		'reject',
		'throw',
	])('reports %s without rejecting and recovers on retry', async (mode) => {
		let fail = true
		const { controller, errors } = setup(() => {
			if (!fail) return Promise.resolve()
			if (mode === 'throw') throw new Error('secret contents must not escape')
			return Promise.reject(new Error('denied'))
		})
		await controller.copy('address')
		expect(errors).toEqual([false, true])
		expect(controller.getSnapshot()).toBe(false)
		fail = false
		await controller.copy('address')
		expect(errors).toEqual([false, true, false])
		expect(controller.getSnapshot()).toBe(true)
		controller.cancel()
	})

	it('reports missing Clipboard API and navigator getter failures', async () => {
		const errors: boolean[] = []
		vi.stubGlobal('navigator', {})
		const controller = createCopyController(undefined, (failed) =>
			errors.push(failed),
		)
		await controller.copy('address')
		expect(errors).toEqual([false, true])
		vi.stubGlobal('navigator', {
			get clipboard() {
				throw new Error('blocked')
			},
		})
		await controller.copy('address')
		expect(errors).toEqual([false, true, false, true])
	})

	it('clears previous success immediately when the next copy fails', async () => {
		let fail = false
		const { controller, errors } = setup(async () => {
			if (fail) throw new Error('denied')
		})
		await controller.copy('one')
		expect(controller.getSnapshot()).toBe(true)
		fail = true
		const pending = controller.copy('two')
		expect(controller.getSnapshot()).toBe(false)
		await pending
		expect(errors).toEqual([false, false, true])
	})

	it.each([
		'resolve',
		'reject',
	] as const)('ignores stale %s after newer success', async (outcome) => {
		const first = deferred()
		let calls = 0
		const { controller, errors } = setup(() =>
			++calls === 1 ? first.promise : Promise.resolve(),
		)
		const pending = controller.copy('old')
		await controller.copy('new')
		first[outcome](new Error('old rejection'))
		await pending
		expect(controller.getSnapshot()).toBe(true)
		expect(errors).toEqual([false, false])
		controller.cancel()
	})

	it('ignores stale success after newer failure', async () => {
		const first = deferred()
		let calls = 0
		const { controller, errors } = setup(() =>
			++calls === 1 ? first.promise : Promise.reject(new Error('denied')),
		)
		const pending = controller.copy('old')
		await controller.copy('new')
		first.resolve()
		await pending
		expect(controller.getSnapshot()).toBe(false)
		expect(errors).toEqual([false, false, true])
	})

	it('restarts the success timer for the newest copy', async () => {
		vi.useFakeTimers()
		const { controller } = setup()
		await controller.copy('one', 800)
		vi.advanceTimersByTime(700)
		await controller.copy('two', 800)
		vi.advanceTimersByTime(100)
		expect(controller.getSnapshot()).toBe(true)
		vi.advanceTimersByTime(700)
		expect(controller.getSnapshot()).toBe(false)
	})

	it.each([
		'resolve',
		'reject',
	] as const)('cancel ignores pending %s but allows remount/retry', async (outcome) => {
		const pending = deferred()
		let calls = 0
		const { controller, errors } = setup(() =>
			++calls === 1 ? pending.promise : Promise.resolve(),
		)
		const result = controller.copy('old')
		controller.cancel()
		pending[outcome](new Error('late'))
		await result
		expect(controller.getSnapshot()).toBe(false)
		expect(errors).toEqual([false])
		await controller.copy('new')
		expect(controller.getSnapshot()).toBe(true)
		controller.cancel()
	})

	it('cleans success timer and unsubscribes observers', async () => {
		vi.useFakeTimers()
		const { controller } = setup()
		const states: boolean[] = []
		const unsubscribe = controller.subscribe(() =>
			states.push(controller.getSnapshot()),
		)
		await controller.copy('one')
		unsubscribe()
		controller.cancel()
		vi.runAllTimers()
		expect(states).toEqual([false, true])
		expect(controller.getSnapshot()).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('keeps separate control success indicators independent', async () => {
		const first = setup()
		const second = setup(async () => {
			throw new Error('denied')
		})
		await first.controller.copy('one')
		await second.controller.copy('two')
		expect(first.controller.getSnapshot()).toBe(true)
		expect(second.controller.getSnapshot()).toBe(false)
		expect(second.errors).toEqual([false, true])
		first.controller.cancel()
	})
	it('ignores an old failure from another control after a newer copy succeeds', async () => {
		const target = new EventTarget()
		vi.stubGlobal('window', target)
		const feedback: unknown[] = []
		target.addEventListener(copyFeedbackEvent, (event) => {
			if (event instanceof CustomEvent) feedback.push(event.detail)
		})
		const old = deferred()
		const first = createCopyController(() => old.promise)
		const second = createCopyController(async () => {})
		const pending = first.copy('private first value')
		await second.copy('private second value')
		old.reject(new Error('late denial'))
		await pending
		expect(feedback).toEqual([false, false])
		expect(second.getSnapshot()).toBe(true)
		second.cancel()
	})
})
