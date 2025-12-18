import * as React from 'react'
import { createHighlighterCoreSync, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import jsonLang from 'shiki/langs/json.mjs'
import rust from 'shiki/langs/rust.mjs'
import solidity from 'shiki/langs/solidity.mjs'
import vyper from 'shiki/langs/vyper.mjs'
import githubDark from 'shiki/themes/github-dark.mjs'
import githubLight from 'shiki/themes/github-light.mjs'
import { CollapsibleSection } from '#comps/Contract.tsx'
import { cx } from '#cva.config.ts'
import type { ContractSource } from '#lib/domain/contract-source.ts'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'
import LinkIcon from '~icons/lucide/link'
import SolidityIcon from '~icons/vscode-icons/file-type-solidity'
import VyperIcon from '~icons/vscode-icons/file-type-vyper'

const SHIKI_THEMES = {
	light: 'github-light',
	dark: 'github-dark',
} satisfies Record<'light' | 'dark', string>

const SHIKI_LANGS = [solidity, vyper, jsonLang, rust]

let highlighterInstance: HighlighterCore | null = null

function getHighlighter(): HighlighterCore {
	if (!highlighterInstance) {
		highlighterInstance = createHighlighterCoreSync({
			themes: [githubLight, githubDark],
			langs: SHIKI_LANGS,
			engine: createJavaScriptRegexEngine(),
		})
	}
	return highlighterInstance
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

function SourceFile(
	props: { fileName: string; content: string } & {
		className?: string | undefined
	},
) {
	const { fileName, content } = props

	const { copy, notifying } = useCopy({ timeout: 2_000 })
	const [isCollapsed, setIsCollapsed] = React.useState(false)

	const language = React.useMemo(
		() => getLanguageFromFileName(fileName),
		[fileName],
	)
	const { highlightedHtml } = useShikiHighlight({
		source: content,
		language,
		enabled: !isCollapsed,
	})

	const handleCopy = React.useCallback(() => {
		void copy(content)
	}, [copy, content])

	const lineCount = React.useMemo(() => content.split('\n').length, [content])

	return (
		<div
			className={cx(
				'flex flex-col border border-card-border bg-card-header rounded-md px-2',
				props.className,
			)}
		>
			<div className="flex items-center justify-between gap-3 py-2">
				<button
					type="button"
					onClick={() => setIsCollapsed((v) => !v)}
					className="flex items-center gap-2 align-middle bg-base-alt/40 py-1 px-2 rounded-xs cursor-pointer press-down min-w-0 max-w-full"
				>
					{language === 'solidity' ? (
						<SolidityIcon className="size-[15px] shrink-0" />
					) : (
						<VyperIcon className="size-[15px] shrink-0" />
					)}
					<span
						id={`source-file-${fileName.replace('.', '-').toLowerCase()}`}
						className="text-[12px] font-mono text-primary/50 hover:text-primary whitespace-nowrap overflow-x-auto text-left"
					>
						{fileName}
					</span>
				</button>
				<button
					type="button"
					title="Copy permalink"
					className="press-down text-tertiary/70 hover:text-primary hover:bg-base-alt/50 p-1 transition-colors mr-auto cursor-pointer"
					onClick={() => {
						const permaLink = `${window.location.href}#${fileName.replace('.', '-').toLowerCase()}`
						console.info(permaLink)
					}}
				>
					<LinkIcon className="size-3.5" />
				</button>
				<div className="flex items-center gap-2 shrink-0">
					<span
						className={cx('text-[11px] text-tertiary', {
							'text-tertiary/50': !isCollapsed,
						})}
					>
						{lineCount} lines
					</span>
					<button
						type="button"
						onClick={() => setIsCollapsed((v) => !v)}
						className={cx(
							'text-[14px] font-mono cursor-pointer press-down',
							isCollapsed ? 'text-accent' : 'text-tertiary',
						)}
					>
						[{isCollapsed ? '+' : '–'}]
					</button>
				</div>
			</div>

			{!isCollapsed && (
				<div className="group relative overflow-hidden">
					<div className="absolute top-2 right-2 flex items-center gap-1.5">
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
							<CopyIcon className="size-3.5" />
						</button>
					</div>
					{highlightedHtml ? (
						<div
							// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted shiki output
							dangerouslySetInnerHTML={{ __html: highlightedHtml }}
							className="shiki text-primary whitespace-pre bg-card-header! pl-0!"
						/>
					) : (
						<pre className="shiki-block text-primary whitespace-pre bg-card-header! pl-0!">
							{content}
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
	rs: 'rust',
	py: 'python',
}

const getLanguageFromFileName = (fileName: string) =>
	EXTENSION_LANGUAGE_MAP[fileName.split('.').pop()?.toLowerCase() ?? ''] ??
	'solidity'

function useShikiHighlight(params: {
	source: string
	language: string
	enabled?: boolean
}) {
	const { source, language, enabled = true } = params

	const highlightedHtml = React.useMemo(() => {
		if (!enabled) return null
		try {
			const highlighter = getHighlighter()
			const html = highlighter.codeToHtml(source, {
				lang: language,
				themes: SHIKI_THEMES,
				defaultColor: 'light-dark()',
			})
			return processHighlightedHtml(html)
		} catch (error) {
			console.error('Failed to highlight contract source:', error)
			return null
		}
	}, [source, language, enabled])

	return { highlightedHtml }
}

function processHighlightedHtml(html: string): string {
	if (typeof window === 'undefined') return html
	const parser = new DOMParser()
	const doc = parser.parseFromString(html, 'text/html')
	const pre = doc.querySelector('pre')
	if (pre) {
		pre.classList.add('shiki-block')
		pre.style.backgroundColor = 'transparent'
		const code = pre.querySelector('code')
		if (code) {
			code.style.display = 'block'
			code.style.padding = '0'
			code.style.backgroundColor = 'transparent'
		}
		return pre.outerHTML
	}
	return html
}

/**
 * Source section for ContractTabContent - matches ABI section style
 */
export function SourceSection(props: { source: ContractSource }) {
	const { source } = props
	const [expanded, setExpanded] = React.useState(true)

	const { compilation, runtimeMatch, verifiedAt, stdJsonInput } = source
	const fileCount = Object.keys(stdJsonInput.sources).length
	const compilerVersionUrl = getCompilerVersionUrl(
		compilation.compiler,
		compilation.version,
	)

	const optimizerText = getOptimizerText(compilation)

	return (
		<CollapsibleSection
			title="Source"
			expanded={expanded}
			onToggle={() => setExpanded(!expanded)}
		>
			<div className="flex flex-col gap-2 px-[18px] py-[12px]">
				<div className="flex justify-between text-[12px] px-[18px] py-[12px] -mx-[18px] -mt-[12px] mb-1 bg-base-alt/50">
					<div className="flex flex-col gap-0.5">
						<div className="text-primary/80">{compilation.name}</div>
						<div className="text-primary/80">Verified: {verifiedAt}</div>
						<div className="text-tertiary">Match: {runtimeMatch}</div>
					</div>
					<div className="flex flex-col gap-0.5 text-right">
						<div>
							<a
								href={compilerVersionUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary/80 hover:underline press-down"
							>
								{compilation.version} ({compilation.compiler})
							</a>
						</div>
						<div className="text-tertiary">{optimizerText}</div>
						<div className="text-tertiary">{fileCount} files</div>
					</div>
				</div>
				{Object.entries(stdJsonInput.sources).map(([fileName, { content }]) => (
					<SourceFile key={fileName} fileName={fileName} content={content} />
				))}
			</div>
		</CollapsibleSection>
	)
}
