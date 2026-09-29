import type { CodeViewItem, CodeViewLineSelection } from '@pierre/diffs'
import {
	CodeView,
	type CodeViewHandle,
	WorkerPoolContextProvider,
} from '@pierre/diffs/react'
import HighlightWorker from '@pierre/diffs/worker/worker.js?worker'
import { useLocation, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { ContractCodeScrollbar } from '#comps/ContractCodeScrollbar.tsx'
import { ContractFileTree } from '#comps/ContractFileTree.tsx'
import {
	type ContractSourceFile,
	longestLineColumns,
} from '#lib/domain/contract-source.ts'
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
	const navigate = useNavigate()
	const localSelection = React.useRef<{
		entries: typeof entries
		target: Parameters<typeof createContractSourceLink>[1]
	} | null>(null)
	const viewer = React.useRef<CodeViewHandle<undefined>>(null)
	const [activeFile, setActiveFile] = React.useState(entries[0]?.[0] ?? '')
	const [selection, setSelection] =
		React.useState<CodeViewLineSelection | null>(null)
	const [wrap, setWrap] = React.useState(false)
	const [scrollCode, setScrollCode] = React.useState<HTMLElement | null>(null)
	const syncScrollCode = React.useCallback(() => {
		const item = viewer.current
			?.getInstance()
			?.getRenderedItems()
			.find(({ id }) => id === activeFile)
		setScrollCode(
			item?.element.shadowRoot?.querySelector<HTMLElement>('[data-code]') ??
				null,
		)
	}, [activeFile])
	React.useEffect(syncScrollCode, [syncScrollCode])
	const [theme, setTheme] = React.useState(getInitialThemeMode)
	const sourceCopy = useCopy()
	const linkCopy = useCopy()
	const paths = React.useMemo(() => entries.map(([name]) => name), [entries])
	// Virtualization renders only visible lines, so size every file to the widest
	// line and longest line number to keep the horizontal scroll width static.
	const sourceWidth = React.useMemo(
		() =>
			({
				'--contract-source-columns': Math.max(
					0,
					...entries.map(([, source]) => longestLineColumns(source.content)),
				),
				'--contract-source-line-digits': Math.max(
					1,
					...entries.map(
						([, source]) => `${source.content.split('\n').length}`.length,
					),
				),
			}) as React.CSSProperties,
		[entries],
	)
	const updateSelectionUrl = React.useCallback(
		(target: Parameters<typeof createContractSourceLink>[1]) => {
			const url = new URL(
				createContractSourceLink(new URL(window.location.href), target),
			)
			localSelection.current = { entries, target }
			void navigate({
				href: `${url.pathname}${url.search}`,
				replace: true,
				resetScroll: false,
			})
		},
		[entries, navigate],
	)
	const selectFile = React.useCallback(
		(name: string) => {
			setActiveFile(name)
			setSelection(null)
			updateSelectionUrl({ id: name, range: null })
			viewer.current?.scrollTo({ type: 'item', id: name, align: 'start' })
		},
		[updateSelectionUrl],
	)
	const selectLines = React.useCallback(
		(next: CodeViewLineSelection | null) => {
			setSelection(next)
			updateSelectionUrl(next ?? { id: activeFile, range: null })
		},
		[activeFile, updateSelectionUrl],
	)
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
			onPostRender: syncScrollCode,
			unsafeCSS:
				':host { --diffs-font-family: "Geist Mono", ui-monospace, monospace; --diffs-font-size: 12px; --diffs-line-height: 22px; --diffs-min-number-column-width: calc(var(--contract-source-line-digits, 3) * 1ch); } :host, [data-file] { --diffs-bg: var(--color-source-background); } [data-overflow="scroll"] [data-code] { grid-template-columns: var(--diffs-grid-number-column-width) minmax(calc((var(--contract-source-columns, 0) + 4) * 1ch), 1fr); }',
		}),
		[theme, wrap, syncScrollCode],
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
		const local = localSelection.current
		localSelection.current = null
		// URL updates from the editor must not scroll it or reset a drag selection.
		if (
			local?.entries === entries &&
			target?.id === local.target.id &&
			target?.range?.start ===
				(local.target.range
					? Math.min(local.target.range.start, local.target.range.end)
					: undefined) &&
			target?.range?.end ===
				(local.target.range
					? Math.max(local.target.range.start, local.target.range.end)
					: undefined)
		)
			return
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
		<div className="overflow-hidden rounded-md border border-card-border bg-source-background">
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
					<div className="min-w-0 md:flex-1">
						<CodeView
							ref={viewer}
							items={items}
							options={options}
							selectedLines={selection}
							onSelectedLinesChange={selectLines}
							onScroll={(_, instance) => {
								const top =
									instance.getContainerElement()?.getBoundingClientRect().top ??
									0
								const visible = instance
									.getRenderedItems()
									.find(
										({ element }) =>
											element.getBoundingClientRect().bottom > top + 40,
									)
								if (visible) setActiveFile(visible.id)
							}}
							className="min-h-0 min-w-0 md:flex-1"
							style={{ height: 620, overflow: 'auto', ...sourceWidth }}
						/>
						<ContractCodeScrollbar code={scrollCode} wrap={wrap} />
					</div>
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
