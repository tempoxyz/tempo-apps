import * as React from 'react'
import type { Abi } from 'viem'

// ============================================================================
// ABI Viewer
// ============================================================================

export function AbiViewer(props: { abi: Abi }) {
	const { abi } = props
	const json = React.useMemo(() => JSON.stringify(abi, null, 2), [abi])
	const highlightedHtml = useHighlightedJson(json)

	return (
		<div className="max-h-[280px] overflow-auto mx-3 mb-2">
			{highlightedHtml ? (
				<div
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted shiki output
					dangerouslySetInnerHTML={{ __html: highlightedHtml }}
					className="shiki shiki-block text-primary whitespace-pre"
					style={{ padding: 16, maxHeight: 'none', overflow: 'visible' }}
				/>
			) : (
				<pre
					className="shiki-block text-primary whitespace-pre"
					style={{ padding: 16, maxHeight: 'none', overflow: 'visible' }}
				>
					{json}
				</pre>
			)}
		</div>
	)
}

function useHighlightedJson(json: string): string | null {
	const [html, setHtml] = React.useState<string | null>(null)

	React.useEffect(() => {
		let cancelled = false

		async function highlight() {
			const { createHighlighterCore } = await import('shiki/core')
			const { createJavaScriptRegexEngine } = await import(
				'shiki/engine/javascript'
			)

			const highlighter = await createHighlighterCore({
				themes: [
					import('@shikijs/themes/github-light'),
					import('@shikijs/themes/github-dark'),
				],
				langs: [import('@shikijs/langs/json')],
				engine: createJavaScriptRegexEngine({ forgiving: true }),
			})

			if (cancelled) return

			const result = highlighter.codeToHtml(json, {
				lang: 'json',
				themes: { light: 'github-light', dark: 'github-dark' },
				defaultColor: 'light-dark()',
			})

			if (!cancelled) setHtml(result)
		}

		highlight()
		return () => {
			cancelled = true
		}
	}, [json])

	return html
}
