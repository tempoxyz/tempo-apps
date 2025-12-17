import * as React from 'react'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import githubLight from 'shiki/dist/themes/github-light.mjs'
import { createOnigurumaEngine, loadWasm } from 'shiki/engine/oniguruma'
import jsonLang from 'shiki/langs/json.mjs'
import solidity from 'shiki/langs/solidity.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import vyper from 'shiki/langs/vyper.mjs'
import githubDark from 'shiki/themes/github-dark.mjs'
import { ContractFeatureCard } from '#comps/ContractReader'
import { cx } from '#cva.config.ts'
import type { ContractSource } from '#lib/domain/contract-source.ts'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

const SHIKI_THEMES = {
	light: 'github-light',
	dark: 'github-dark',
} satisfies Record<'light' | 'dark', string>

const SHIKI_LANGS = [solidity, vyper, typescript, jsonLang]

// TODO: replace with '../../node_modules/shiki/dist/onig.wasm'
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

function getCompilerVersionUrl(compiler: string, version: string) {
	return `https://github.com/${compiler.toLowerCase() === 'vyper' ? 'vyperlang/vyper' : 'argotorg/solidity'}/releases/tag/v${version}`
}

function getOptimizerText(compilation: ContractSource['compilation']) {
	const isVyper = compilation.compiler === 'vyper'
	if (isVyper) {
		return compilation.compilerSettings.evmVersion
			? `EVM: ${compilation.compilerSettings.evmVersion}`
			: 'Vyper'
	}
	return compilation.compilerSettings.optimizer?.enabled
		? `Optimizer: enabled, runs: ${compilation.compilerSettings.optimizer.runs}`
		: 'Optimizer: disabled'
}

export function ContractSources(props: ContractSource) {
	const {
		stdJsonInput,
		// TODO: use this ABI when it's available and only resort to whatsabi if not available
		abi: _abi,
		compilation,
		verifiedAt,
		runtimeMatch,
	} = props

	const optimizerText = getOptimizerText(compilation)
	const compilerVersionUrl = getCompilerVersionUrl(
		compilation.compiler,
		compilation.version,
	)

	return (
		<ContractFeatureCard
			title={`Source code (${runtimeMatch})`}
			rightSideTitle={verifiedAt}
			rightSideDescription={optimizerText}
			description="Verified contract source code."
			textGrid={[
				{
					right: (
						<span className="font-medium text-primary/80">
							{compilation.name}
						</span>
					),
				},
				{
					right: (
						<a
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-primary/80"
							href={compilerVersionUrl}
						>
							{compilation.version} ({compilation.compiler})
						</a>
					),
				},
			]}
		>
			<div className="flex flex-col gap-2">
				{Object.entries(stdJsonInput.sources).map(([fileName, { content }]) => (
					<SourceFile key={fileName} fileName={fileName} content={content} />
				))}
			</div>
		</ContractFeatureCard>
	)
}

function SourceFile(
	props: { fileName: string; content: string } & {
		className?: string | undefined
	},
) {
	const { fileName, content } = props
	const [isCollapsed, setIsCollapsed] = React.useState(false)
	const { copy, notifying } = useCopy({ timeout: 2_000 })
	const language = React.useMemo(
		() => getLanguageFromFileName(fileName),
		[fileName],
	)
	const { containerRef, hasHighlight, isHighlighting } = useShikiHighlight({
		source: content,
		language,
		enabled: !isCollapsed,
	})

	const handleCopy = React.useCallback(() => {
		void copy(content)
	}, [copy, content])

	const lineCount = React.useMemo(() => content.split('\n').length, [content])

	return (
		<div className={cx('flex flex-col', props.className)}>
			<button
				type="button"
				onClick={() => setIsCollapsed((v) => !v)}
				className={cx(
					'flex items-center justify-between gap-3 py-2 cursor-pointer press-down -outline-offset-2!',
				)}
			>
				<span className="text-[12px] font-mono text-secondary break-all text-left">
					{fileName}
				</span>
				<div className="flex items-center gap-2 shrink-0">
					{isCollapsed && (
						<span className="text-[11px] text-tertiary">{lineCount} lines</span>
					)}
					<div
						className={cx(
							'text-[14px] font-mono',
							isCollapsed ? 'text-accent' : 'text-tertiary',
						)}
					>
						[{isCollapsed ? '+' : '–'}]
					</div>
				</div>
			</button>

			{!isCollapsed && (
				<div className="relative">
					<div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
						{notifying && (
							<span className="text-[11px] uppercase tracking-wide text-tertiary leading-none">
								copied
							</span>
						)}
						<button
							type="button"
							onClick={handleCopy}
							title={notifying ? 'Copied' : 'Copy source'}
							className="rounded-md bg-card p-1.5 text-tertiary press-down hover:text-primary transition-colors"
						>
							<CopyIcon className="h-3.5 w-3.5" />
						</button>
					</div>
					<div ref={containerRef} aria-hidden={!hasHighlight} />
					{!hasHighlight && (
						<pre className="shiki shiki-block text-primary whitespace-pre">
							{isHighlighting ? 'Loading source…' : content}
						</pre>
					)}
				</div>
			)}
		</div>
	)
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
	sol: 'solidity',
	vy: 'vyper',
	ts: 'typescript',
	json: 'json',
	py: 'python',
}

function getLanguageFromFileName(fileName: string): string {
	const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
	return EXTENSION_LANGUAGE_MAP[extension] ?? 'solidity'
}

function useShikiHighlight(params: {
	source: string
	language: string
	enabled?: boolean
}) {
	const { source, language, enabled = true } = params
	const [hasHighlight, setHasHighlight] = React.useState(false)
	const [isHighlighting, setIsHighlighting] = React.useState(true)
	const containerRef = React.useRef<HTMLDivElement | null>(null)

	React.useEffect(() => {
		if (!enabled) return

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
	}, [language, source, enabled])

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
