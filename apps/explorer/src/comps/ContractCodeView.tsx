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
import { cx } from '#lib/css'
import type { ContractSourceFile } from '#lib/domain/contract-source.ts'
import {
	createContractSourceLink,
	parseContractSourceLink,
} from '#lib/domain/contract-source-link'
import { useCopy } from '#lib/hooks'
import { getInitialThemeMode } from '#lib/theme'
import CopyIcon from '~icons/lucide/copy'
import LinkIcon from '~icons/lucide/link'
import PanelLeftIcon from '~icons/lucide/panel-left'
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
	const container = React.useRef<HTMLDivElement>(null)
	const sidebarId = React.useId()
	const [compact, setCompact] = React.useState(true)
	const [sidebarPreference, setSidebarPreference] = React.useState<
		boolean | null
	>(null)
	const sidebarOpen = sidebarPreference ?? !compact
	React.useEffect(() => {
		const element = container.current
		if (!element) return
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setCompact(entry.contentRect.width < 1000)
		})
		observer.observe(element)
		return () => observer.disconnect()
	}, [])
	const [wrap, setWrap] = React.useState(true)
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
			if (compact) setSidebarPreference(false)
			setActiveFile(name)
			setSelection(null)
			updateSelectionUrl({ id: name, range: null })
			viewer.current?.scrollTo({ type: 'item', id: name, align: 'start' })
		},
		[compact, updateSelectionUrl],
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
				':host { --diffs-font-family: "Geist Mono", ui-monospace, monospace; --diffs-font-size: 12px; --diffs-line-height: 22px; } :host, [data-file] { --diffs-bg: var(--color-source-background); }',
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
		<div
			ref={container}
			className="@container/source overflow-hidden rounded-lg border border-card-border bg-source-background"
		>
			<div className="flex items-center justify-between gap-2 border-b border-card-border p-2 label-12">
				<div className="flex min-w-0 items-center gap-2">
					<button
						type="button"
						aria-label={sidebarOpen ? 'Hide source files' : 'Show source files'}
						title={sidebarOpen ? 'Hide source files' : 'Show source files'}
						aria-expanded={sidebarOpen}
						aria-controls={sidebarId}
						onClick={() => setSidebarPreference(!sidebarOpen)}
						className={cx(
							toolbarButton,
							sidebarOpen && 'bg-base-alt text-primary',
						)}
					>
						<PanelLeftIcon className="size-4" />
					</button>
					<span className="whitespace-nowrap font-medium">
						{entries.length}{' '}
						<span className="hidden @sm/source:inline">source </span>
						{entries.length === 1 ? 'file' : 'files'}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-1 text-secondary">
					<button
						type="button"
						aria-label="Wrap lines"
						title="Wrap lines"
						aria-pressed={wrap}
						onClick={() => setWrap(!wrap)}
						className={cx(toolbarButton, wrap && 'bg-base-alt text-primary')}
					>
						<WrapIcon className="size-4" />
						<span className="hidden @lg/source:inline">Wrap</span>
					</button>
					<button
						type="button"
						aria-label={linkCopy.notifying ? 'Link copied' : 'Copy link'}
						title="Copy link"
						onClick={copyPermalink}
						className={toolbarButton}
					>
						<LinkIcon className="size-4" />
						<span className="hidden @lg/source:inline">
							{linkCopy.notifying ? 'Copied!' : 'Copy link'}
						</span>
					</button>
					<button
						type="button"
						aria-label={sourceCopy.notifying ? 'File copied' : 'Copy file'}
						title="Copy file"
						onClick={() => void sourceCopy.copy(currentSource)}
						className={toolbarButton}
					>
						<CopyIcon className="size-4" />
						<span className="hidden @lg/source:inline">
							{sourceCopy.notifying ? 'Copied!' : 'Copy file'}
						</span>
					</button>
					<span className="sr-only" role="status">
						{linkCopy.notifying
							? 'Link copied to clipboard'
							: sourceCopy.notifying
								? 'File copied to clipboard'
								: ''}
					</span>
				</div>
			</div>
			<div className="flex min-w-0 flex-col @2xl/source:flex-row">
				<div
					id={sidebarId}
					hidden={!sidebarOpen}
					className="shrink-0 @2xl/source:w-[240px]"
				>
					<ContractFileTree
						key={JSON.stringify(paths)}
						paths={paths}
						selectedPath={selectedPath}
						onSelect={selectFile}
					/>
				</div>
				<WorkerPoolContextProvider
					poolOptions={highlightPoolOptions}
					highlighterOptions={highlightOptions}
				>
					<div className="min-w-0 flex-1">
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
							className="h-[min(620px,70svh)] min-h-[320px] min-w-0 overflow-auto"
						/>
						<ContractCodeScrollbar code={scrollCode} wrap={wrap} />
					</div>
				</WorkerPoolContextProvider>
			</div>
			<div className="flex flex-wrap justify-between gap-2 border-t border-card-border px-3 py-2 label-12 text-tertiary">
				<span>
					{selection
						? `Lines ${Math.min(selection.range.start, selection.range.end)}–${Math.max(selection.range.start, selection.range.end)}`
						: 'Select line numbers to link to code'}
				</span>
				<span className="hidden @sm/source:inline">Read only</span>
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

const toolbarButton =
	'flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-secondary transition-colors hover:bg-base-alt hover:text-primary focus-visible:outline-2 focus-visible:outline-focus'
