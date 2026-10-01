import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimeFormat } from '#lib/time-format'

const storageKey = 'tempo-explorer-time-format'

function stubStorage(saved: string | null = null) {
	const values = new Map<string, string>([['unrelated-preference', 'keep']])
	if (saved !== null) values.set(storageKey, saved)
	const writes: [string, string][] = []
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			writes.push([key, value])
			values.set(key, value)
		},
	}
	vi.stubGlobal('window', { localStorage: storage })
	return { storage, values, writes }
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('timestamp preference', () => {
	it.each<TimeFormat>([
		'relative',
		'local',
		'utc',
		'unix',
	])('restores %s without writing during initialization or subscription', async (saved) => {
		const { values, writes } = stubStorage(saved)
		const store = await import('#lib/time-format')
		const unsubscribe = store.subscribeTimeFormat(() => {})
		expect(store.getTimeFormat()).toBe(saved)
		unsubscribe()
		expect(store.getTimeFormat()).toBe(saved)
		expect(writes).toEqual([])
		expect(values.get('unrelated-preference')).toBe('keep')
	})

	it.each([
		null,
		'',
		'UTC',
		' utc ',
		'future',
		'{}',
		'["unix"]',
		'null',
	])('falls back for invalid storage %s and can persist the next selection', async (saved) => {
		const { values, writes } = stubStorage(saved)
		const store = await import('#lib/time-format')
		expect(store.getTimeFormat()).toBe('relative')
		expect(writes).toEqual([])
		store.cycleTimeFormat()
		expect(store.getTimeFormat()).toBe('local')
		expect(values.get(storageKey)).toBe('local')
		expect(values.get('unrelated-preference')).toBe('keep')
	})

	it.each<TimeFormat>([
		'relative',
		'local',
		'utc',
		'unix',
	])('persists an explicit %s selection across a new page session', async (selected) => {
		const { values } = stubStorage()
		const store = await import('#lib/time-format')
		store.setTimeFormat(selected)
		vi.resetModules()
		const reloaded = await import('#lib/time-format')
		expect(reloaded.getTimeFormat()).toBe(selected)
		expect(values.get('unrelated-preference')).toBe('keep')
	})

	it('advances every rapid cycle from the latest shared selection', async () => {
		const { writes } = stubStorage()
		const store = await import('#lib/time-format')
		const first: TimeFormat[] = []
		const second: TimeFormat[] = []
		const unsubscribeFirst = store.subscribeTimeFormat(() => {
			first.push(store.getTimeFormat())
		})
		const unsubscribeSecond = store.subscribeTimeFormat(() => {
			second.push(store.getTimeFormat())
		})
		expect(store.getTimeFormat()).toBe('relative')
		for (let i = 0; i < 12; i++) store.cycleTimeFormat()
		const expected = [
			'local',
			'utc',
			'unix',
			'relative',
			'local',
			'utc',
			'unix',
			'relative',
			'local',
			'utc',
			'unix',
			'relative',
		]
		expect(first).toEqual(expected)
		expect(second).toEqual(expected)
		expect(writes.map(([, value]) => value)).toEqual(expected)
		unsubscribeFirst()
		unsubscribeSecond()

		const remounted: TimeFormat[] = []
		const unsubscribeRemounted = store.subscribeTimeFormat(() => {
			remounted.push(store.getTimeFormat())
		})
		store.setTimeFormat((current) => (current === 'relative' ? 'utc' : 'unix'))
		store.setTimeFormat((current) => (current === 'utc' ? 'local' : 'relative'))
		expect(remounted).toEqual(['utc', 'local'])
		expect(store.getTimeFormat()).toBe('local')
		expect(first).toEqual(expected)
		expect(second).toEqual(expected)
		unsubscribeRemounted()
	})

	it.each([
		'getter',
		'read',
		'write',
	])('keeps a usable shared preference when the storage %s throws', async (fault) => {
		const { storage } = stubStorage('utc')
		const fail = () => {
			throw new Error('Storage denied')
		}
		if (fault === 'getter') {
			vi.stubGlobal('window', {
				get localStorage() {
					return fail()
				},
			})
		} else if (fault === 'read') {
			storage.getItem = fail
		} else {
			storage.setItem = fail
		}
		const store = await import('#lib/time-format')
		expect(store.getTimeFormat()).toBe(fault === 'write' ? 'utc' : 'relative')
		const first: TimeFormat[] = []
		const stop = store.subscribeTimeFormat(() =>
			first.push(store.getTimeFormat()),
		)
		store.cycleTimeFormat()
		expect(first).toEqual(fault === 'write' ? ['unix'] : ['local'])
		stop()
		const second: TimeFormat[] = []
		const stopAgain = store.subscribeTimeFormat(() =>
			second.push(store.getTimeFormat()),
		)
		expect(store.getTimeFormat()).toBe(fault === 'write' ? 'unix' : 'local')
		store.cycleTimeFormat()
		expect(second).toEqual(fault === 'write' ? ['relative'] : ['utc'])
		stopAgain()
	})

	it('handles cleanup and subscriptions added during notification', async () => {
		stubStorage()
		const store = await import('#lib/time-format')
		const observed: string[] = []
		const late = () => observed.push(`late:${store.getTimeFormat()}`)
		const removed = () => observed.push(`removed:${store.getTimeFormat()}`)
		const stopFirst = store.subscribeTimeFormat(() => {
			observed.push(`first:${store.getTimeFormat()}`)
			stopRemoved()
			store.subscribeTimeFormat(late)
		})
		const stopRemoved = store.subscribeTimeFormat(removed)
		store.cycleTimeFormat()
		expect(observed).toEqual(['first:local'])
		stopFirst()
		stopFirst()
		store.cycleTimeFormat()
		expect(observed).toEqual(['first:local', 'late:utc'])
		expect(store.getTimeFormat()).toBe('utc')
	})

	it('uses relative server snapshots without reading or leaking browser state', async () => {
		const store = await import('#lib/time-format')
		const { useTimeFormat, TimeColumnHeader } = await import(
			'#comps/TimeFormat'
		)
		function Control() {
			const { formatLabel, cycleTimeFormat } = useTimeFormat()
			return createElement(TimeColumnHeader, {
				formatLabel,
				onCycle: cycleTimeFormat,
			})
		}
		expect(store.getTimeFormat()).toBe('relative')
		store.setTimeFormat('unix')
		expect(renderToStaticMarkup(createElement(Control))).toBe(
			'<button type="button" title="Showing relative time - click to change">Time</button>',
		)
		const { writes } = stubStorage('utc')
		expect(store.getTimeFormat()).toBe('utc')
		store.setTimeFormat('unix')
		expect(store.getTimeFormat()).toBe('unix')
		expect(renderToStaticMarkup(createElement(Control))).toContain(
			'Showing relative time',
		)
		expect(writes).toEqual([[storageKey, 'unix']])
		vi.unstubAllGlobals()
		expect(store.getTimeFormat()).toBe('relative')
		expect(renderToStaticMarkup(createElement(Control))).toContain(
			'Showing relative time',
		)
	})

	it('preserves UTC and unix timestamp text and the semantic dateTime', async () => {
		const { FormattedTimestamp } = await import('#comps/TimeFormat')
		expect(
			renderToStaticMarkup(
				createElement(FormattedTimestamp, {
					timestamp: 1_700_000_000n,
					format: 'utc',
				}),
			),
		).toBe(
			'<time dateTime="2023-11-14T22:13:20.000Z">Nov 14, 22:13:20 UTC</time>',
		)
		expect(
			renderToStaticMarkup(
				createElement(FormattedTimestamp, {
					timestamp: 1_700_000_000n,
					format: 'unix',
				}),
			),
		).toBe('<time dateTime="2023-11-14T22:13:20.000Z">1700000000</time>')
	})
})
