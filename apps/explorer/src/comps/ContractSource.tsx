import * as React from 'react'
import { ContractFeatureCard } from '#comps/Contract.tsx'
import { cx } from '#lib/css'
import type { ContractSource } from '#lib/domain/contract-source.ts'
import { useCopy, useCopyPermalink } from '#lib/hooks'
import CheckIcon from '~icons/lucide/check'
import CopyIcon from '~icons/lucide/copy'
import LinkIcon from '~icons/lucide/link'
import SolidityIcon from '~icons/vscode-icons/file-type-solidity'
import VyperIcon from '~icons/vscode-icons/file-type-vyper'

function getCompilerVersionUrl(compiler: string, version: string) {
	const isVyper = compiler.toLowerCase() === 'vyper'
	const repo = isVyper ? 'vyperlang/vyper' : 'argotorg/solidity'

	const tag = isVyper ? version.trim() : version.trim().split('+commit.', 1)[0]

	return `https://github.com/${repo}/releases/tag/v${tag}`
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

function getLanguageFromFileName(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
	return ext === 'vy' ? 'vyper' : ext === 'rs' ? 'rust' : 'solidity'
}

export function SourceSection(props: ContractSource) {
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
		compilation.compilerVersion,
	)

	return (
		<ContractFeatureCard
			rightSideTitle={verifiedAt}
			rightSideDescription={optimizerText}
			title={`Source code (${runtimeMatch})`}
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
							{compilation.compilerVersion} ({compilation.compiler})
						</a>
					),
				},
			]}
		>
			<div className="flex flex-col gap-2">
				{Object.entries(stdJsonInput.sources).map(([fileName, source]) => (
					<SourceFile
						key={fileName}
						fileName={fileName}
						content={source.content}
						highlightedHtml={source.highlightedHtml}
					/>
				))}
			</div>
		</ContractFeatureCard>
	)
}

function SourceFile(props: {
	fileName: string
	content: string
	highlightedHtml?: string
	className?: string | undefined
}) {
	const { fileName, content, highlightedHtml } = props

	const { copy, notifying } = useCopy({ timeout: 2_000 })
	const [isCollapsed, setIsCollapsed] = React.useState(false)

	const sourceFragment = `source-file-${fileName.replace('.', '-').toLowerCase()}`
	const { linkNotifying, handleCopyPermalink } = useCopyPermalink({
		fragment: sourceFragment,
	})

	const language = React.useMemo(
		() => getLanguageFromFileName(fileName),
		[fileName],
	)

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
					title={linkNotifying ? 'Copied!' : 'Copy permalink'}
					className="press-down text-tertiary/70 hover:text-primary hover:bg-base-alt/50 p-1 transition-colors mr-auto cursor-pointer"
					onClick={handleCopyPermalink}
				>
					{linkNotifying ? (
						<CheckIcon className="size-3.5" />
					) : (
						<LinkIcon className="size-3.5" />
					)}
				</button>
				<div className="flex items-center gap-2 shrink-0">
					<span
						className={cx(
							'text-[11px]',
							isCollapsed ? 'text-tertiary' : 'text-tertiary/50',
						)}
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
							// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted shiki output from server
							dangerouslySetInnerHTML={{ __html: highlightedHtml }}
							className="shiki shiki-block text-primary whitespace-pre bg-card-header! pl-0!"
						/>
					) : (
						<pre className="shiki shiki-block text-primary whitespace-pre bg-card-header! pl-0!">
							{content}
						</pre>
					)}
				</div>
			)}
		</div>
	)
}
