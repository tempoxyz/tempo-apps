import type { CodeViewItem, CodeViewLineSelection } from '@pierre/diffs'
import {
	CodeView,
	type CodeViewHandle,
	WorkerPoolContextProvider,
} from '@pierre/diffs/react'
import HighlightWorker from '@pierre/diffs/worker/worker.js?worker'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { style, vars } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
import { ContractCodeScrollbar } from '#comps/ContractCodeScrollbar.tsx'
import { ContractFileTree } from '#comps/ContractFileTree.tsx'
import type { ContractSourceFile } from '#lib/domain/contract-source.ts'
import {
	createContractSourceLink,
	parseContractSourceLink,
} from '#lib/domain/contract-source-link'
import { useCopy } from '#lib/hooks'
import { getInitialThemeMode } from '#lib/theme'
import { pressDown, srOnly, transitionColors } from '#styles/explorer'
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
				':host { --diffs-font-family: "JetBrains Mono", ui-monospace, monospace; --diffs-font-size: 12px; --diffs-line-height: 22px; } :host, [data-file] { --diffs-bg: var(--contract-source-background); }',
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
		<div ref={container} {...styles.root()}>
			<div {...styles.toolbar()}>
				<div {...styles.toolbarStart()}>
					<button
						type="button"
						aria-label={sidebarOpen ? 'Hide source files' : 'Show source files'}
						title={sidebarOpen ? 'Hide source files' : 'Show source files'}
						aria-expanded={sidebarOpen}
						aria-controls={sidebarId}
						onClick={() => setSidebarPreference(!sidebarOpen)}
						{...cx(
							styles.toolbarButton(),
							transitionColors(),
							pressDown(),
							sidebarOpen && styles.toolbarButtonActive(),
						)}
					>
						<PanelLeftIcon {...styles.toolbarIcon()} />
					</button>
					<span {...styles.fileCount()}>
						{entries.length} <span {...styles.wideLabel()}>source </span>
						{entries.length === 1 ? 'file' : 'files'}
					</span>
				</div>
				<div {...styles.toolbarEnd()}>
					<button
						type="button"
						aria-label="Wrap lines"
						title="Wrap lines"
						aria-pressed={wrap}
						onClick={() => setWrap(!wrap)}
						{...cx(
							styles.toolbarButton(),
							transitionColors(),
							pressDown(),
							wrap && styles.toolbarButtonActive(),
						)}
					>
						<WrapIcon {...styles.toolbarIcon()} />
						<span {...styles.buttonLabel()}>Wrap</span>
					</button>
					<button
						type="button"
						aria-label={linkCopy.notifying ? 'Link copied' : 'Copy link'}
						title="Copy link"
						onClick={copyPermalink}
						{...cx(styles.toolbarButton(), transitionColors(), pressDown())}
					>
						<LinkIcon {...styles.toolbarIcon()} />
						<span {...styles.buttonLabel()}>
							{linkCopy.notifying ? 'Copied!' : 'Copy link'}
						</span>
					</button>
					<button
						type="button"
						aria-label={sourceCopy.notifying ? 'File copied' : 'Copy file'}
						title="Copy file"
						onClick={() => void sourceCopy.copy(currentSource)}
						{...cx(styles.toolbarButton(), transitionColors(), pressDown())}
					>
						<CopyIcon {...styles.toolbarIcon()} />
						<span {...styles.buttonLabel()}>
							{sourceCopy.notifying ? 'Copied!' : 'Copy file'}
						</span>
					</button>
					<span {...srOnly()} role="status">
						{linkCopy.notifying
							? 'Link copied to clipboard'
							: sourceCopy.notifying
								? 'File copied to clipboard'
								: ''}
					</span>
				</div>
			</div>
			<div {...styles.panes()}>
				<div id={sidebarId} hidden={!sidebarOpen} {...styles.sidebar()}>
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
					<div {...styles.code()}>
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
							{...styles.codeView()}
						/>
						<ContractCodeScrollbar code={scrollCode} wrap={wrap} />
					</div>
				</WorkerPoolContextProvider>
			</div>
			<div {...styles.footer()}>
				<span>
					{selection
						? `Lines ${Math.min(selection.range.start, selection.range.end)}–${Math.max(selection.range.start, selection.range.end)}`
						: 'Select line numbers to link to code'}
				</span>
				<span {...styles.wideLabel()}>Read only</span>
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

namespace styles {
	export const root = style({
		// Read by the viewer's shadow DOM through `unsafeCSS`.
		'--contract-source-background': vars.color.background.secondary,
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderWidth: 'regular',
		containerName: 'source',
		containerType: 'inline-size',
		overflow: 'hidden',
	})

	export const toolbar = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		padding: '8',
		typography: 'body.b3',
	})

	export const toolbarStart = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0px !custom',
	})

	// Mirrors a small tertiary TDS Button; the label collapses to an icon at
	// narrow widths, which TDS Button's minimum width does not allow.
	export const toolbarButton = style({
		alignItems: 'center',
		borderRadius: 'full',
		color: 'content.secondary',
		cursor: 'pointer',
		display: 'flex',
		flexShrink: 0,
		gap: '4',
		height: '32',
		justifyContent: 'center',
		minWidth: '32px !custom',
		paddingInline: '8',
		typography: 'body.b3',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'container.regular',
				color: 'content.primary',
			},
		},
	})

	export const toolbarButtonActive = style({
		backgroundColor: 'container.regular',
		color: 'content.primary',
	})

	export const toolbarIcon = style({ height: '16', width: '16' })

	export const fileCount = style({ whiteSpace: 'nowrap' })

	export const wideLabel = style({
		display: 'none',
		'@container source (width >= 24rem)': { display: 'inline' },
	})

	export const buttonLabel = style({
		display: 'none',
		'@container source (width >= 32rem)': { display: 'inline' },
	})

	export const toolbarEnd = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		flexShrink: 0,
		gap: '4',
	})

	export const panes = style({
		display: 'flex',
		flexDirection: 'column',
		minWidth: '0px !custom',
		'@container source (width >= 42rem)': { flexDirection: 'row' },
	})

	export const sidebar = style({
		flexShrink: 0,
		'@container source (width >= 42rem)': { width: '240px !custom' },
	})

	export const code = style({ flex: 1, minWidth: '0px !custom' })

	export const codeView = style({
		height: 'min(620px, 70svh) !custom',
		minHeight: '320px !custom',
		minWidth: '0px !custom',
		overflow: 'auto',
	})

	export const footer = style({
		borderColor: 'line.secondary',
		borderTopWidth: 'regular',
		color: 'content.tertiary',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		justifyContent: 'space-between',
		paddingBlock: '8',
		paddingInline: '12',
		typography: 'body.b3',
	})
}
