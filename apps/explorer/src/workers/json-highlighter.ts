import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

type HighlightRequest = {
	id: number
	json: string
}

type HighlightResponse =
	| { id: number; html: string }
	| { id: number; error: string }

type WorkerScope = {
	addEventListener: (
		type: 'message',
		listener: (event: MessageEvent<HighlightRequest>) => void,
	) => void
	postMessage: (message: HighlightResponse) => void
}

const workerScope = globalThis as unknown as WorkerScope
let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter(): Promise<HighlighterCore> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighterCore({
			themes: [
				import('@shikijs/themes/github-light'),
				import('@shikijs/themes/github-dark'),
			],
			langs: [import('@shikijs/langs/json')],
			engine: createJavaScriptRegexEngine({ forgiving: true }),
		})
	}
	return highlighterPromise
}

workerScope.addEventListener('message', (event) => {
	const { id, json } = event.data
	void getHighlighter()
		.then((highlighter) =>
			highlighter.codeToHtml(json, {
				lang: 'json',
				themes: { light: 'github-light', dark: 'github-dark' },
				defaultColor: 'light-dark()',
			}),
		)
		.then(
			(html) => workerScope.postMessage({ id, html }),
			(error) =>
				workerScope.postMessage({
					id,
					error: error instanceof Error ? error.message : 'Highlighting failed',
				}),
		)
})
