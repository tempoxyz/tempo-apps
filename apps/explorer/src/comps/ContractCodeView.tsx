import type { CodeViewItem, CodeViewLineSelection } from '@pierre/diffs'
import {
	CodeView,
	type CodeViewHandle,
	WorkerPoolContextProvider,
} from '@pierre/diffs/react'
import HighlightWorker from '@pierre/diffs/worker/worker.js?worker'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Button, IconButton, Tooltip, style, vars } from '@tempoxyz/ds/platform'
import {
	Check,
	Copy,
	LayoutSidebar,
	Link as LinkIcon,
} from '@tempoxyz/ds/platform/icons'
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
import { pressDown, transitionColors } from '#styles/explorer'
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
	// Toolbar actions collapse to icons below 32rem.
	const [narrow, setNarrow] = React.useState(true)
	const [sidebarPreference, setSidebarPreference] = React.useState<
		boolean | null
	>(null)
	const sidebarOpen = sidebarPreference ?? !compact
	React.useEffect(() => {
		const element = container.current
		if (!element) return
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return
			setCompact(entry.contentRect.width < 1000)
			setNarrow(entry.contentRect.width < 512)
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
	const sourceCopy = useCopy({ message: 'File copied', timeout: 2_000 })
	const linkCopy = useCopy({ message: 'Link copied', timeout: 2_000 })
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
					<ToolbarAction
						label={sidebarOpen ? 'Hide source files' : 'Show source files'}
						active={sidebarOpen}
						aria-expanded={sidebarOpen}
						aria-controls={sidebarId}
						onClick={() => setSidebarPreference(!sidebarOpen)}
					>
						<LayoutSidebar {...styles.toolbarIcon()} />
					</ToolbarAction>
					<span {...styles.fileCount()}>
						{entries.length} <span {...styles.wideLabel()}>source </span>
						{entries.length === 1 ? 'file' : 'files'}
					</span>
				</div>
				<div {...styles.toolbarEnd()}>
					<ToolbarAction
						label="Wrap lines"
						text={narrow ? undefined : 'Wrap'}
						active={wrap}
						aria-pressed={wrap}
						onClick={() => setWrap(!wrap)}
					>
						<WrapIcon {...styles.toolbarIcon()} />
					</ToolbarAction>
					<ToolbarAction
						label="Copy link"
						text={narrow ? undefined : 'Copy link'}
						onClick={copyPermalink}
					>
						{linkCopy.notifying ? (
							<Check {...styles.toolbarIcon()} />
						) : (
							<LinkIcon {...styles.toolbarIcon()} />
						)}
					</ToolbarAction>
					<ToolbarAction
						label="Copy file"
						text={narrow ? undefined : 'Copy file'}
						onClick={() => void sourceCopy.copy(currentSource)}
					>
						{sourceCopy.notifying ? (
							<Check {...styles.toolbarIcon()} />
						) : (
							<Copy {...styles.toolbarIcon()} />
						)}
					</ToolbarAction>
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

/** Small toolbar action: a labelled Button, or an IconButton without `text`. */
function ToolbarAction(
	props: Pick<
		React.ComponentProps<'button'>,
		'aria-controls' | 'aria-expanded' | 'aria-pressed' | 'onClick'
	> & {
		active?: boolean | undefined
		children: React.ReactElement
		label: string
		text?: string | undefined
	},
): React.JSX.Element {
	const { active, children, label, text, ...rest } = props
	const variant = active ? 'secondary' : 'tertiary'
	if (text)
		return (
			<Button
				{...rest}
				scale="small"
				variant={variant}
				{...cx(styles.toolbarAction(), transitionColors(), pressDown())}
			>
				{children}
				{text}
			</Button>
		)
	return (
		<Tooltip content={label}>
			<IconButton
				{...rest}
				aria-label={label}
				scale="small"
				variant={variant}
				{...cx(styles.toolbarAction(), transitionColors(), pressDown())}
			>
				{children}
			</IconButton>
		</Tooltip>
	)
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

	export const toolbarAction = style({
		flexShrink: 0,
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const toolbarIcon = style({ height: '16', width: '16' })

	export const fileCount = style({ whiteSpace: 'nowrap' })

	export const wideLabel = style({
		display: 'none',
		'@container source (width >= 24rem)': { display: 'inline' },
	})

	export const toolbarEnd = style({
		alignItems: 'center',
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
		color: 'content.secondary',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		justifyContent: 'space-between',
		paddingBlock: '8',
		paddingInline: '12',
		typography: 'body.b3',
	})
}
