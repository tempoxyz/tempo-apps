import { style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import type { Abi } from 'viem'

type HighlightRequest = {
	id: number
	json: string
}

type HighlightResponse =
	| { id: number; html: string }
	| { id: number; error: string }

const HIGHLIGHT_CACHE_SIZE = 20
const highlightCache = new Map<string, string>()
const highlightsInFlight = new Map<string, Promise<string>>()
const pendingWorkerRequests = new Map<
	number,
	{
		resolve: (html: string) => void
		reject: (error: Error) => void
	}
>()

let highlighterWorker: Worker | null = null
let nextWorkerRequestId = 0

function getHighlighterWorker(): Worker {
	if (highlighterWorker) return highlighterWorker

	highlighterWorker = new Worker(
		new URL('../workers/json-highlighter.ts', import.meta.url),
		{ type: 'module' },
	)
	highlighterWorker.addEventListener(
		'message',
		(event: MessageEvent<HighlightResponse>) => {
			const request = pendingWorkerRequests.get(event.data.id)
			if (!request) return

			pendingWorkerRequests.delete(event.data.id)
			if ('html' in event.data) request.resolve(event.data.html)
			else request.reject(new Error(event.data.error))
		},
	)
	highlighterWorker.addEventListener('error', () => {
		for (const request of pendingWorkerRequests.values()) {
			request.reject(new Error('Syntax highlighting worker failed'))
		}
		pendingWorkerRequests.clear()
		highlighterWorker?.terminate()
		highlighterWorker = null
	})

	return highlighterWorker
}

function getCachedHighlight(json: string): string | undefined {
	const html = highlightCache.get(json)
	if (!html) return undefined

	highlightCache.delete(json)
	highlightCache.set(json, html)
	return html
}

function cacheHighlight(json: string, html: string): void {
	highlightCache.set(json, html)
	if (highlightCache.size <= HIGHLIGHT_CACHE_SIZE) return

	const oldestKey = highlightCache.keys().next().value
	if (oldestKey !== undefined) highlightCache.delete(oldestKey)
}

function highlightJson(json: string): Promise<string> {
	const cached = getCachedHighlight(json)
	if (cached) return Promise.resolve(cached)

	const existing = highlightsInFlight.get(json)
	if (existing) return existing

	const id = nextWorkerRequestId++
	const promise = new Promise<string>((resolve, reject) => {
		pendingWorkerRequests.set(id, { resolve, reject })
		getHighlighterWorker().postMessage({ id, json } satisfies HighlightRequest)
	})
	highlightsInFlight.set(json, promise)
	void promise.then(
		(html) => {
			cacheHighlight(json, html)
			highlightsInFlight.delete(json)
		},
		() => highlightsInFlight.delete(json),
	)
	return promise
}

function scheduleWhenIdle(callback: () => void): () => void {
	if (typeof window.requestIdleCallback === 'function') {
		const id = window.requestIdleCallback(callback, { timeout: 1_000 })
		return () => window.cancelIdleCallback(id)
	}

	const id = window.setTimeout(callback, 50)
	return () => window.clearTimeout(id)
}

// ABI Viewer

export function AbiViewer(props: AbiViewer.Props): React.JSX.Element {
	const { abi, enabled } = props
	const json = React.useMemo(() => JSON.stringify(abi, null, 2), [abi])
	const highlightedHtml = useHighlightedJson(json, enabled)

	return (
		<div {...styles.viewer()}>
			{highlightedHtml ? (
				<div
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted shiki output
					dangerouslySetInnerHTML={{ __html: highlightedHtml }}
					{...styles.code({
						className: 'shiki shiki-block',
						style: { padding: 16, maxHeight: 'none', overflow: 'visible' },
					})}
				/>
			) : (
				<pre
					{...styles.code({
						className: 'shiki-block',
						style: { padding: 16, maxHeight: 'none', overflow: 'visible' },
					})}
				>
					{json}
				</pre>
			)}
		</div>
	)
}

export declare namespace AbiViewer {
	type Props = {
		abi: Abi
		enabled: boolean
	}
}

function useHighlightedJson(json: string, enabled: boolean): string | null {
	const [highlighted, setHighlighted] = React.useState<{
		json: string
		html: string
	} | null>(null)

	React.useEffect(() => {
		if (!enabled) return

		let cancelled = false
		const cancelScheduledHighlight = scheduleWhenIdle(() => {
			void highlightJson(json).then(
				(html) => {
					if (!cancelled) setHighlighted({ json, html })
				},
				() => undefined,
			)
		})
		return () => {
			cancelled = true
			cancelScheduledHighlight()
		}
	}, [enabled, json])

	return highlighted?.json === json ? highlighted.html : null
}

namespace styles {
	export const viewer = style({
		marginBottom: '8',
		marginInline: '12',
		maxHeight: '280px !custom',
		overflow: 'auto',
	})

	// `shiki` and `shiki-block` are global classes for the highlighter's markup.
	export const code = style({ color: 'content.primary', whiteSpace: 'pre' })
}
