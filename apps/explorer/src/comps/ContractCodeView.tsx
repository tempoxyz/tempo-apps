import type { CodeViewItem, CodeViewLineSelection } from '@pierre/diffs'
import {
	CodeView,
	type CodeViewHandle,
	WorkerPoolContextProvider,
} from '@pierre/diffs/react'
import HighlightWorker from '@pierre/diffs/worker/worker.js?worker'
import { useLocation } from '@tanstack/react-router'
import * as React from 'react'
import { ContractFileTree } from '#comps/ContractFileTree.tsx'
import type { ContractSourceFile } from '#lib/domain/contract-source.ts'
import {
	createContractSourceLink,
	parseContractSourceLink,
} from '#lib/domain/contract-source-link'
import { useCopy } from '#lib/hooks'
import { getInitialThemeMode } from '#lib/theme'
import CopyIcon from '~icons/lucide/copy'
import LinkIcon from '~icons/lucide/link'
import WrapIcon from '~icons/lucide/wrap-text'

export function ContractCodeView(
	props: ContractCodeView.Props,
): React.JSX.Element {
	const { entries } = props
	const locationHref = useLocation({ select: (location) => location.href })
	const viewer = React.useRef<CodeViewHandle<undefined>>(null)
	const [activeFile, setActiveFile] = React.useState(entries[0]?.[0] ?? '')
	const [selection, setSelection] =
		React.useState<CodeViewLineSelection | null>(null)
	const [wrap, setWrap] = React.useState(false)
	const [theme, setTheme] = React.useState(getInitialThemeMode)
	const sourceCopy = useCopy()
	const linkCopy = useCopy()
	const paths = React.useMemo(() => entries.map(([name]) => name), [entries])
	const selectFile = React.useCallback((name: string) => {
		setActiveFile(name)
		setSelection(null)
		viewer.current?.scrollTo({ type: 'item', id: name, align: 'start' })
	}, [])
	const items = React.useMemo<CodeViewItem[]>(
		() =>
			entries.map(([name, source]) => {
				// Unique revisions invalidate both CodeView and worker highlight caches.
				const version = ++sourceRevision
				return {
					id: name,
					type: 'file',
					file: {
						name,
						contents: source.content,
						cacheKey: `contract-source:${version}`,
						lang: name.endsWith('.vy')
							? 'vyper'
							: name.endsWith('.rs')
								? 'rust'
								: name.endsWith('.sol')
									? 'solidity'
									: 'text',
					},
					version,
				}
			}),
		[entries],
	)
	const options = React.useMemo(
		() => ({
			theme: { light: 'github-light', dark: 'github-dark' },
			themeType: theme,
			stickyHeaders: true,
			itemMetrics: { lineHeight: 22 },
			enableLineSelection: true,
			overflow: wrap ? ('wrap' as const) : ('scroll' as const),
			layout: { paddingTop: 0, paddingBottom: 16, gap: 16 },
			unsafeCSS:
				':host { --diffs-font-family: "Geist Mono", ui-monospace, monospace; --diffs-font-size: 12px; --diffs-line-height: 22px; }',
		}),
		[theme, wrap],
	)

	React.useEffect(() => {
		const observer = new MutationObserver(() => setTheme(getInitialThemeMode()))
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme'],
		})
		return () => observer.disconnect()
	}, [])

	React.useEffect(() => {
		const target = parseContractSourceLink(
			new URL(locationHref, window.location.origin),
			entries,
		)
		const path = target?.id ?? entries[0]?.[0]
		setSelection(target?.range ? { id: target.id, range: target.range } : null)
		if (!path) return
		setActiveFile(path)
		viewer.current?.scrollTo({
			type: 'line',
			id: path,
			lineNumber: target?.range?.start ?? 1,
			align: 'start',
		})
	}, [entries, locationHref])

	const selectedPath = selection?.id ?? activeFile
	const currentSource =
		entries.find(([name]) => name === selectedPath)?.[1].content ?? ''

	function copyPermalink() {
		void linkCopy.copy(
			createContractSourceLink(new URL(window.location.href), {
				id: selectedPath,
				range: selection?.range ?? null,
			}),
		)
	}

	return (
		<div className="overflow-hidden rounded-md border border-card-border bg-base-background">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-border px-3 py-2.5 text-xs">
				<span className="font-medium">
					{entries.length} source files{' '}
					<span className="ml-2 font-normal text-tertiary">Read only</span>
				</span>
				<div className="flex flex-wrap items-center gap-3 text-secondary">
					<button
						type="button"
						aria-pressed={wrap}
						onClick={() => setWrap(!wrap)}
						className="flex items-center gap-1.5 cursor-pointer hover:text-primary"
					>
						<WrapIcon />
						Wrap
					</button>
					<button
						type="button"
						onClick={copyPermalink}
						className="flex items-center gap-1.5 cursor-pointer hover:text-primary"
					>
						<LinkIcon />
						{linkCopy.notifying ? 'Copied!' : 'Copy link'}
					</button>
					<button
						type="button"
						onClick={() => void sourceCopy.copy(currentSource)}
						className="flex items-center gap-1.5 cursor-pointer hover:text-primary"
					>
						<CopyIcon />
						{sourceCopy.notifying ? 'Copied!' : 'Copy file'}
					</button>
				</div>
			</div>
			<div className="flex min-w-0 flex-col md:flex-row">
				<ContractFileTree
					key={JSON.stringify(paths)}
					paths={paths}
					selectedPath={selectedPath}
					onSelect={selectFile}
				/>
				<WorkerPoolContextProvider
					poolOptions={highlightPoolOptions}
					highlighterOptions={highlightOptions}
				>
					<CodeView
						ref={viewer}
						items={items}
						options={options}
						selectedLines={selection}
						onSelectedLinesChange={setSelection}
						onScroll={(_, instance) => {
							const top =
								instance.getContainerElement()?.getBoundingClientRect().top ?? 0
							const visible = instance
								.getRenderedItems()
								.find(
									({ element }) =>
										element.getBoundingClientRect().bottom > top + 40,
								)
							if (visible) setActiveFile(visible.id)
						}}
						className="min-h-0 min-w-0 md:flex-1"
						style={{ height: 620, overflow: 'auto' }}
					/>
				</WorkerPoolContextProvider>
			</div>
			<div className="flex flex-wrap justify-between gap-2 border-t border-card-border px-3 py-2 text-[11px] text-tertiary">
				<span>
					{selection
						? `Lines ${Math.min(selection.range.start, selection.range.end)}–${Math.max(selection.range.start, selection.range.end)}`
						: 'Click a line number to select · Shift-click to select a range'}
				</span>
			</div>
		</div>
	)
}

export declare namespace ContractCodeView {
	type Props = {
		entries: Array<[string, ContractSourceFile]>
	}
}

const highlightPoolOptions = {
	workerFactory: () => new HighlightWorker(),
	poolSize: 2,
}
const highlightOptions = {
	theme: { light: 'github-light', dark: 'github-dark' },
}
let sourceRevision = 0
