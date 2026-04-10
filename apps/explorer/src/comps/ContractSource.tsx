import * as React from 'react'
import { ContractFeatureCard } from '#comps/ContractFeatureCard.tsx'
import { cx } from '#lib/css'
import type {
	ContractSource,
	ContractSourceFile,
} from '#lib/domain/contract-source.ts'
import { useCopy, useCopyPermalink } from '#lib/hooks'
import CheckIcon from '~icons/lucide/check'
import CopyIcon from '~icons/lucide/copy'
import FileCode2Icon from '~icons/lucide/file-code-2'
import LinkIcon from '~icons/lucide/link'
import SolidityIcon from '~icons/vscode-icons/file-type-solidity'
import RustIcon from '~icons/material-icon-theme/rust'
import ExternalLinkIcon from '~icons/lucide/external-link'
import VyperIcon from '~icons/vscode-icons/file-type-vyper'

function getCompilerVersionUrl(compiler: string, version: string) {
	const isVyper = compiler.toLowerCase() === 'vyper'
	const repo = isVyper ? 'vyperlang/vyper' : 'argotorg/solidity'

	const tag = isVyper ? version.trim() : version.trim().split('+commit.', 1)[0]

	return `https://github.com/${repo}/releases/tag/v${tag}`
}

function getOptimizerText(
	compilation: Extract<ContractSource, { kind: 'verified' }>['compilation'],
) {
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

function getSourceEntries(
	source: ContractSource,
): Array<[string, ContractSourceFile]> {
	if (source.kind === 'verified') {
		return Object.entries(source.stdJsonInput.sources)
	}

	return Object.entries(source.sources).toSorted(([left], [right]) => {
		const leftIndex = source.nativeSource.paths.indexOf(left)
		const rightIndex = source.nativeSource.paths.indexOf(right)
		const safeLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
		const safeRightIndex =
			rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
		return safeLeftIndex - safeRightIndex || left.localeCompare(right)
	})
}

function getCommitUrl(
	source: Extract<ContractSource, { kind: 'native' }>,
): string {
	return (
		source.nativeSource.commitUrl ??
		`https://github.com/${source.nativeSource.repository}/commit/${source.nativeSource.commit}`
	)
}

function getNativeActivationText(
	source: Extract<ContractSource, { kind: 'native' }>,
): string | undefined {
	const activation = source.nativeSource.activation
	const parts: string[] = []
	if (activation.protocolVersion) parts.push(activation.protocolVersion)
	if (activation.fromBlock) parts.push(`from block ${activation.fromBlock}`)
	if (activation.toBlock) parts.push(`until block ${activation.toBlock}`)
	return parts.length > 0 ? parts.join(' · ') : undefined
}

function formatSourceKind(kind: string): string {
	return kind.replaceAll('_', ' ')
}

function getSourceFragment(fileName: string): string {
	return `source-file-${fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function LanguageIcon(props: { language: string }) {
	const { language } = props
	if (language === 'solidity')
		return <SolidityIcon className="size-[15px] shrink-0" />

	if (language === 'vyper')
		return <VyperIcon className="size-[15px] shrink-0" />

	if (language === 'rust') return <RustIcon className="size-[15px] shrink-0" />

	return <FileCode2Icon className="size-[15px] shrink-0 text-tertiary" />
}

export function SourceSection(props: ContractSource & { docsUrl?: string }) {
	const sourceEntries = getSourceEntries(props)

	if (props.kind === 'verified') {
		const optimizerText = getOptimizerText(props.compilation)
		const compilerVersionUrl = getCompilerVersionUrl(
			props.compilation.compiler,
			props.compilation.compilerVersion,
		)

		return (
			<ContractFeatureCard
				rightSideTitle={props.verifiedAt ?? undefined}
				rightSideDescription={optimizerText}
				title={`Source code (${props.runtimeMatch ?? 'verified'})`}
				description="Verified contract source code."
				textGrid={[
					{
						right: (
							<div className="space-x-2 flex items-center">
								<span className="font-medium text-primary/80">
									{props.compilation.name}
								</span>
								{props.docsUrl && (
									<a
										target="_blank"
										rel="noopener noreferrer"
										href={props.docsUrl}
										className="text-[11px] text-accent hover:underline press-down inline-flex items-center gap-[4px]"
									>
										Docs
										<ExternalLinkIcon className="size-[12px]" />
									</a>
								)}
							</div>
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
								{props.compilation.compilerVersion} (
								{props.compilation.compiler})
							</a>
						),
					},
				]}
			>
				<div className="flex flex-col gap-2">
					{sourceEntries.map(([fileName, source]) => (
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

	return (
		<ContractFeatureCard
			rightSideTitle={props.nativeSource.language}
			rightSideDescription={getNativeActivationText(props)}
			title={`Source code (${formatSourceKind(props.nativeSource.kind)})`}
			description="Native Tempo runtime source code."
			textGrid={[
				{
					right: (
						<div className="space-x-2 flex items-center">
							<span className="text-primary/80 text-md">{props.name}</span>
							{props.docsUrl && (
								<a
									target="_blank"
									rel="noopener noreferrer"
									href={props.docsUrl}
									className="text-[11px] text-accent hover:underline press-down inline-flex items-center gap-[4px]"
								>
									Docs
									<ExternalLinkIcon className="size-[12px]" />
								</a>
							)}
						</div>
					),
				},
				{
					right: (
						<a
							target="_blank"
							rel="noopener noreferrer"
							href={getCommitUrl(props)}
							className="text-primary/70 font-mono hover:text-primary/80 transition-colors"
						>
							{props.nativeSource.repository}@
							{props.nativeSource.commit.slice(0, 7)}
						</a>
					),
				},
			]}
		>
			<div className="flex flex-col gap-2">
				{sourceEntries.map(([fileName, source]) => (
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

	const sourceFragment = getSourceFragment(fileName)
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
					<LanguageIcon language={language} />
					<span
						id={sourceFragment}
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
