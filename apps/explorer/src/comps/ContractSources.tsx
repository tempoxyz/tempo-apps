import * as React from 'react'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import githubLight from 'shiki/dist/themes/github-light.mjs'
import { createOnigurumaEngine, loadWasm } from 'shiki/engine/oniguruma'
import jsonLang from 'shiki/langs/json.mjs'
import pythonLang from 'shiki/langs/python.mjs'
import solidity from 'shiki/langs/solidity.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import vyperLang from 'shiki/langs/vyper.mjs'
import yamlLang from 'shiki/langs/yaml.mjs'
import githubDark from 'shiki/themes/github-dark.mjs'
import { ContractFeatureCard } from '#comps/ContractReader'
import type { ContractSourceFile } from '#lib/domain/contract-sources'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

const SHIKI_THEMES = {
	light: 'github-light',
	dark: 'github-dark',
} satisfies Record<'light' | 'dark', string>

const SHIKI_LANGS = [
	solidity,
	vyperLang,
	typescript,
	jsonLang,
	yamlLang,
	pythonLang,
]

const ONIG_WASM_CDN = 'https://esm.sh/shiki/onig.wasm'

let highlighterPromise: Promise<HighlighterCore> | null = null

async function getHighlighter(): Promise<HighlighterCore> {
	if (!highlighterPromise) {
		highlighterPromise = (async () => {
			await loadWasm(fetch(ONIG_WASM_CDN))
			return createHighlighterCore({
				themes: [githubLight, githubDark],
				langs: SHIKI_LANGS,
				engine: createOnigurumaEngine(() => fetch(ONIG_WASM_CDN)),
			})
		})()
	}
	return highlighterPromise
}

export function ContractSources(props: { files: ContractSourceFile[] }) {
	const { files } = props

	return (
		<ContractFeatureCard
			title="Source code"
			description="Verified contract source code."
		>
			<div className="flex flex-col gap-[12px]">
				{files.map((file) => (
					<SourceFile key={file.fileName} file={file} />
				))}
			</div>
		</ContractFeatureCard>
	)
}

function SourceFile(props: { file: ContractSourceFile }) {
	const { file } = props
	const { copy, notifying } = useCopy({ timeout: 2_000 })
	const language = React.useMemo(
		() => getLanguageFromFileName(file.fileName),
		[file.fileName],
	)
	const { containerRef, hasHighlight, isHighlighting } = useShikiHighlight({
		source: file.content,
		language,
	})

	const handleCopy = React.useCallback(() => {
		void copy(file.content)
	}, [copy, file.content])

	return (
		<div className="flex flex-col gap-[8px]">
			<div className="flex items-center justify-between gap-[12px]">
				<span className="text-[12px] font-mono text-secondary break-all">
					{file.fileName}
				</span>
				<div className="flex items-center gap-[6px]">
					{notifying && (
						<span className="text-[11px] uppercase tracking-wide text-tertiary leading-none">
							copied
						</span>
					)}
					<button
						type="button"
						onClick={handleCopy}
						title={notifying ? 'Copied' : 'Copy source'}
						className="rounded-[6px] bg-card p-[6px] text-tertiary press-down hover:text-primary transition-colors"
					>
						<CopyIcon className="h-[14px] w-[14px]" />
					</button>
				</div>
			</div>
			<div ref={containerRef} aria-hidden={!hasHighlight} />
			{!hasHighlight && (
				<pre className="shiki shiki-block text-primary whitespace-pre">
					{isHighlighting ? 'Loading source…' : file.content}
				</pre>
			)}
		</div>
	)
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
	sol: 'solidity',
	v: 'vyper',
	ts: 'typescript',
	json: 'json',
	py: 'python',
}

function getLanguageFromFileName(fileName: string): string {
	const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
	return EXTENSION_LANGUAGE_MAP[extension] ?? 'solidity'
}

function useShikiHighlight(params: { source: string; language: string }) {
	const { source, language } = params
	const [hasHighlight, setHasHighlight] = React.useState(false)
	const [isHighlighting, setIsHighlighting] = React.useState(true)
	const containerRef = React.useRef<HTMLDivElement | null>(null)

	React.useEffect(() => {
		let cancelled = false
		setHasHighlight(false)
		setIsHighlighting(true)
		if (containerRef.current) containerRef.current.innerHTML = ''

		void (async () => {
			try {
				const highlighter = await getHighlighter()
				const html = highlighter.codeToHtml(source, {
					lang: language,
					themes: SHIKI_THEMES,
					defaultColor: 'light-dark()',
				})
				if (cancelled) return
				if (containerRef.current) {
					injectHighlightedHtml(containerRef.current, html)
				}
				setHasHighlight(true)
			} catch (error) {
				console.error('Failed to highlight contract source:', error)
			} finally {
				if (!cancelled) setIsHighlighting(false)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [language, source])

	return { containerRef, hasHighlight, isHighlighting }
}

function injectHighlightedHtml(container: HTMLDivElement, html: string) {
	const template = document.createElement('template')
	template.innerHTML = html.trim()
	const pre = template.content.querySelector('pre')
	if (pre) {
		pre.classList.add('shiki-block')
		pre.style.backgroundColor = 'transparent'
		const code = pre.querySelector('code')
		if (code) {
			code.style.display = 'block'
			code.style.padding = '0'
			code.style.backgroundColor = 'transparent'
		}
	}
	container.replaceChildren(template.content.cloneNode(true))
}
