import * as React from 'react'
import { cx } from '#lib/css'
import {
	type ContractSource,
	type ContractSourceFile,
	getContractCloneCommand,
} from '#lib/domain/contract-source.ts'
import { clientEnv } from '#lib/env'
import { useCopy, useCopyPermalink } from '#lib/hooks'
import CheckIcon from '~icons/lucide/check'
import CopyIcon from '~icons/lucide/copy'
import FileCode2Icon from '~icons/lucide/file-code-2'
import LinkIcon from '~icons/lucide/link'
import SolidityIcon from '~icons/vscode-icons/file-type-solidity'
import RustIcon from '~icons/material-icon-theme/rust'
import VyperIcon from '~icons/vscode-icons/file-type-vyper'

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
	return (
		<section aria-label="Contract source code">
			<SourceBrowser
				key={`${props.chainId}:${props.address}`}
				entries={getSourceEntries(props)}
				cloneCommand={getContractCloneCommand(
					props,
					clientEnv.CONTRACT_VERIFICATION_API_BASE_URL,
				)}
			/>
		</section>
	)
}

function SourceBrowser(props: {
	entries: Array<[string, ContractSourceFile]>
	cloneCommand?: string | undefined
}): React.JSX.Element {
	const [Viewer, setViewer] =
		React.useState<typeof import('./ContractCodeView').ContractCodeView>()
	React.useEffect(() => {
		let mounted = true
		void import('./ContractCodeView')
			.then(({ ContractCodeView }) => {
				if (mounted) setViewer(() => ContractCodeView)
			})
			.catch(() => {
				// Keep the existing readable source view when the optional chunk fails.
			})
		return () => {
			mounted = false
		}
	}, [])
	if (Viewer) return <Viewer {...props} />
	return (
		<div className="flex flex-col gap-2">
			{props.entries.map(([fileName, source]) => (
				<SourceFile
					key={fileName}
					fileName={fileName}
					content={source.content}
					highlightedHtml={source.highlightedHtml}
				/>
			))}
		</div>
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
							className="text-primary bg-card-header!"
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
