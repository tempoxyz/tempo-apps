/** biome-ignore-all lint/a11y/useSemanticElements: rows are CSS subgrids, which native table rows cannot be, so the grid takes table roles instead */
/** biome-ignore-all lint/a11y/useFocusableInteractive: role="table" rows and headers are static, not interactive grid cells */
import { Link, useRouterState } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import { ChevronDown } from '@tempoxyz/ds/platform/icons'
import * as React from 'react'
import { cx } from 'zyzz'
import { Pagination } from '#comps/Pagination'
import { Sections } from '#comps/Sections'
import { Empty } from '#comps/ui/Empty'
import { useNewLiveRows } from '#lib/use-new-live-rows'
import { animatePulse, rowShimmer, transitionColors } from '#styles/explorer'

export function DataGrid(props: DataGrid.Props) {
	const {
		columns,
		items,
		totalItems,
		pages: pagesProp,
		displayCount,
		displayCountCapped = false,
		page,
		fetching = false,
		loading = false,
		countLoading = false,
		disableLastPage = false,
		itemsLabel = 'items',
		itemsPerPage = 10,
		pagination = 'default',
		showSimpleCount = true,
		emptyState = 'No items found.',
		flexible = false,
		onPrefetchNextPage,
		onCancelPrefetchNextPage,
		showSimplePageLabel = true,
	} = props

	const mode = Sections.useSectionsMode()
	const isSearchNavigationPending = useRouterState({
		select: (state) => {
			if (state.status !== 'pending') return false
			if (!state.resolvedLocation) return false

			return state.location.pathname === state.resolvedLocation.pathname
		},
	})
	const effectiveLoading = loading || isSearchNavigationPending
	const activeColumns = mode === 'stacked' ? columns.stacked : columns.tabs
	const activeItems: DataGrid.Row[] = effectiveLoading
		? Array.from({ length: itemsPerPage }, (_, index) => ({
				cells: activeColumns.map((_, colIndex) => {
					const cellKey = `skeleton-${index}-${colIndex}`
					return (
						<div key={cellKey} {...styles.skeletonCell()}>
							<div {...cx(styles.skeletonBar(), animatePulse())} />
						</div>
					)
				}),
			}))
		: items(mode)
	const newLiveRows = useNewLiveRows(
		activeItems.map((item) => item.key),
		effectiveLoading ? undefined : props.liveScope,
	)
	const pages = pagesProp ?? Math.ceil(totalItems / itemsPerPage)
	const isSimpleSinglePage =
		pagination === 'simple' &&
		typeof pages === 'number' &&
		pages <= 1 &&
		page === 1
	const shouldRenderSimpleFooter =
		!isSimpleSinglePage || countLoading || showSimpleCount

	const gridTemplateColumns = activeColumns
		.map((col) => {
			if (typeof col.width === 'number') return `${col.width}px`
			if (col.width === 'max-content') return col.width
			if (typeof col.width === 'string')
				return col.minWidth
					? `minmax(${col.minWidth}px, ${col.width})`
					: `minmax(0, ${col.width})`
			if (col.minWidth) return `minmax(${col.minWidth}px, auto)`
			return mode === 'tabs' ? 'minmax(0, auto)' : 'auto'
		})
		.join(' ')

	return (
		<div {...styles.root()}>
			<div {...styles.scroller()}>
				<div
					{...cx(
						styles.grid({ style: { gridTemplateColumns } }),
						flexible && styles.gridFlexible(),
						mode === 'tabs' && styles.gridTabs(),
					)}
					role="table"
					aria-busy={effectiveLoading}
				>
					<div role="row" {...styles.headerRow()}>
						{activeColumns.map((column, index) => {
							const key = `header-${index}`
							const sortDir = column.sortDirection
							const hasSort = sortDir === 'asc' || sortDir === 'desc'
							const label =
								typeof column.label === 'string'
									? column.label.charAt(0) + column.label.slice(1).toLowerCase()
									: column.label
							return (
								<div
									key={key}
									role="columnheader"
									aria-sort={
										sortDir === 'asc'
											? 'ascending'
											: sortDir === 'desc'
												? 'descending'
												: undefined
									}
									{...cx(
										styles.headerCell(),
										column.align === 'end' && styles.headerCellEnd(),
									)}
								>
									<span {...styles.headerLabel()}>
										{label}
										{hasSort && (
											<ChevronDown
												{...cx(
													styles.sortIcon(),
													sortDir === 'asc' && styles.sortIconAsc(),
												)}
											/>
										)}
									</span>
								</div>
							)
						})}
					</div>
					{activeItems.length === 0 ? (
						<div role="row" {...styles.empty()}>
							<div role="cell" aria-colspan={activeColumns.length}>
								<Empty compact title={emptyState} />
							</div>
						</div>
					) : null}
					{activeItems.map((item, rowIndex) => {
						let maxLines = 1
						for (const cell of item.cells) {
							if (Array.isArray(cell) && cell.length > maxLines)
								maxLines = cell.length
						}
						return (
							<div
								key={item.key ?? `row-${rowIndex}-${page}`}
								role="row"
								{...cx(
									styles.row({ className: item.className }),
									Boolean(item.link) && styles.rowLinked(),
									Boolean(item.link) && transitionColors(),
									Boolean(item.expanded) && styles.rowExpanded(),
									item.key !== undefined &&
										newLiveRows.has(item.key) &&
										styles.rowNew(),
								)}
							>
								{Array.from({ length: maxLines }, (_, lineIndex) => {
									const key = `line-${rowIndex}-${lineIndex}`
									return (
										<React.Fragment key={key}>
											{item.cells.map((cell, cellIndex) => {
												const key = `cell-${rowIndex}-${cellIndex}-${lineIndex}`
												const column = activeColumns[cellIndex]
												const lines = Array.isArray(cell) ? cell : [cell]
												const content = lines[lineIndex] ?? null
												const isFirstColumn = cellIndex === 0
												const isLastColumn =
													cellIndex === activeColumns.length - 1
												return (
													<div
														key={key}
														role="cell"
														{...cx(
															styles.cell(),
															isFirstColumn && styles.cellFirst(),
															isLastColumn && styles.cellLast(),
															column?.align === 'end' && styles.cellEnd(),
															Boolean(item.link) && styles.cellLinked(),
															mode === 'tabs' && styles.cellTabs(),
														)}
													>
														{/* The row link covers the whole row from inside the
															first cell, so the row holds only cells. */}
														{item.link && isFirstColumn && lineIndex === 0 && (
															<Link
																to={item.link.href}
																search={item.link.search}
																title={item.link.title}
																preload="intent"
																data-row-link=""
																{...styles.rowLink()}
															/>
														)}
														{content}
													</div>
												)
											})}
											{lineIndex < maxLines - 1 && (
												<div aria-hidden="true" {...styles.lineDivider()} />
											)}
										</React.Fragment>
									)
								})}
								{item.expanded && typeof item.expanded !== 'boolean' && (
									<div
										role="cell"
										aria-colspan={activeColumns.length}
										{...styles.expanded()}
									>
										{item.expanded}
									</div>
								)}
							</div>
						)
					})}
				</div>
			</div>
			<div {...styles.footer()}>
				{pagination !== 'default' && pagination !== 'simple' ? (
					pagination
				) : pagination === 'simple' ? (
					shouldRenderSimpleFooter ? (
						<div
							{...cx(
								styles.simpleFooter(),
								showSimpleCount && styles.simpleFooterSpread(),
							)}
						>
							<Pagination.Simple
								page={page}
								pages={pages}
								pagesCapped={displayCountCapped}
								fetching={fetching && !effectiveLoading}
								countLoading={countLoading}
								disableLastPage={disableLastPage}
								onPrefetchNext={onPrefetchNextPage}
								onCancelPrefetchNext={onCancelPrefetchNextPage}
								showPageLabel={showSimplePageLabel}
							/>
							{showSimpleCount ? (
								<Pagination.Count
									totalItems={displayCount ?? 0}
									itemsLabel={itemsLabel}
									loading={effectiveLoading || displayCount == null}
									capped={displayCountCapped}
								/>
							) : null}
						</div>
					) : null
				) : (
					<Pagination
						page={page}
						pages={typeof pages === 'number' ? pages : 1}
						totalItems={totalItems}
						itemsLabel={itemsLabel}
						isPending={fetching}
						compact={mode === 'stacked'}
					/>
				)}
			</div>
		</div>
	)
}

export namespace DataGrid {
	export interface Column {
		label: React.ReactNode
		align?: 'start' | 'end'
		minWidth?: number
		width?: number | `${number}fr` | 'max-content'
		sortDirection?: 'asc' | 'desc'
	}

	export interface RowLink {
		href: string
		search?: Record<string, unknown>
		title: string
	}

	export type Cell = React.ReactNode | React.ReactNode[]

	export interface Row {
		/** Stable identity for the row; falls back to the row index when omitted. */
		key?: string
		cells: Cell[]
		link?: RowLink
		expanded?: boolean | React.ReactNode
		className?: string
	}

	export interface Props {
		/** Enables new-row highlights, resetting when the feed scope changes. */
		liveScope?: string | undefined
		columns: {
			stacked: Column[]
			tabs: Column[]
		}
		items: (mode: Sections.Mode) => Row[]
		totalItems: number
		/** Total pages (number) or indefinite pagination ({ hasMore: boolean }) */
		pages?: number | { hasMore: boolean }
		/** Optional separate count for display (e.g., exact transaction count) */
		displayCount?: number
		/** Whether the display count is capped (shows "> X" prefix) */
		displayCountCapped?: boolean
		page: number
		fetching?: boolean
		loading?: boolean
		countLoading?: boolean
		/** Disable "Last page" button when we can't reliably navigate there */
		disableLastPage?: boolean
		onPrefetchNextPage?: () => void
		onCancelPrefetchNextPage?: () => void
		showSimplePageLabel?: boolean
		itemsLabel?: string
		itemsPerPage?: number
		pagination?: 'default' | 'simple' | React.ReactNode
		showSimpleCount?: boolean
		emptyState?: React.ReactNode
		flexible?: boolean
	}
}

namespace styles {
	export const skeletonCell = style({
		alignItems: 'center',
		display: 'flex',
		maxWidth: '180px !custom',
		minHeight: '24',
		width: '100% !custom',
	})

	export const skeletonBar = style({
		backgroundColor: 'container.regular',
		borderRadius: '3xs',
		height: '12',
		width: '100% !custom',
	})

	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		minHeight: '0 !custom',
	})

	export const scroller = style({
		overflowX: 'auto',
		position: 'relative',
		width: '100% !custom',
	})

	export const grid = style({
		display: 'grid',
		typography: 'body.b2',
		width: '100% !custom',
	})

	export const gridFlexible = style({ minWidth: 'max-content !custom' })

	export const gridTabs = style({ maxWidth: '100% !custom' })

	export const headerRow = style({
		borderBottomColor: 'line.secondary',
		borderBottomStyle: 'solid',
		borderBottomWidth: 'regular',
		display: 'grid',
		gridColumn: '1 / -1',
		gridTemplateColumns: 'subgrid',
	})

	export const headerCell = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		gap: '8',
		height: '36px !custom',
		justifyContent: 'flex-start',
		paddingInline: '12',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
		':first-child': { paddingLeft: '16' },
		':last-child': { paddingRight: '16' },
	})

	export const headerCellEnd = style({ justifyContent: 'flex-end' })

	export const headerLabel = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	export const sortIcon = style({
		color: 'content.secondary',
		height: '12',
		width: '12',
	})

	export const sortIconAsc = style({ rotate: '180deg' })

	export const empty = style({
		alignItems: 'center',
		color: 'content.secondary',
		display: 'flex',
		gridColumn: '1 / -1',
		justifyContent: 'center',
		minHeight: '220px !custom',
		paddingBlock: '32',
		paddingInline: '16',
	})

	export const row = style({
		borderBottomColor: 'line.secondary',
		borderBottomStyle: 'solid',
		borderBottomWidth: 'regular',
		borderLeftColor: 'transparent !custom',
		borderLeftStyle: 'solid',
		borderLeftWidth: '3px !custom',
		display: 'grid',
		gridAutoFlow: 'row',
		gridColumn: '1 / -1',
		gridTemplateColumns: 'subgrid',
		position: 'relative',
		':last-child': { borderBottomWidth: 'none' },
	})

	export const rowLinked = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
		selectors: {
			// Shift cell contents, not cells: a transformed cell would contain
			// the absolutely positioned row link mid-click.
			'&:has([data-row-link]:active) > * > :not([data-row-link])': {
				translate: '0 0.5px !custom',
			},
		},
	})

	export const rowExpanded = style({ borderLeftColor: 'line.secondary' })

	export const rowNew = style({
		animation: `${rowShimmer} 0.5s ease-out 1`,
	})

	// Positioned against the row (cells are static), so it covers the row and
	// its left border from inside the first cell.
	export const rowLink = style({
		bottom: '0px !custom',
		left: '-3px !custom',
		outlineOffset: '-2px !custom',
		position: 'absolute',
		right: '0px !custom',
		top: '0px !custom',
		zIndex: 0,
	})

	export const cell = style({
		alignItems: 'flex-start',
		color: 'content.primary',
		display: 'flex',
		justifyContent: 'flex-start',
		minHeight: '48',
		paddingBlock: '12',
		paddingInline: '12',
	})

	export const cellFirst = style({ paddingLeft: '16' })

	export const cellLast = style({ paddingRight: '16' })

	export const cellEnd = style({
		justifyContent: 'flex-end',
		textAlign: 'right',
	})

	export const cellLinked = style({
		pointerEvents: 'none',
		selectors: {
			'& a:not([data-row-link])': {
				pointerEvents: 'auto',
				position: 'relative',
				zIndex: 1,
			},
			'& button': { pointerEvents: 'auto', position: 'relative', zIndex: 1 },
			'& [data-row-link]': { pointerEvents: 'auto' },
		},
	})

	// Cells clip, so focus rings inside them are drawn inset.
	export const cellTabs = style({
		minWidth: '0 !custom',
		overflow: 'hidden',
		selectors: {
			'& a:focus-visible': { outlineOffset: '-2px !custom' },
			'& button:focus-visible': { outlineOffset: '-2px !custom' },
		},
	})

	export const lineDivider = style({
		borderBottomColor: 'line.secondary',
		borderBottomStyle: 'solid',
		borderBottomWidth: 'regular',
		gridColumn: '1 / -1',
	})

	export const expanded = style({
		contain: 'inline-size',
		gridColumn: '1 / -1',
		marginTop: '-4px !custom',
		paddingBottom: '12',
		paddingInline: '16',
	})

	export const footer = style({ marginTop: 'auto !custom' })

	export const simpleFooter = style({
		alignItems: 'center',
		borderTopColor: 'line.secondary',
		borderTopStyle: 'solid',
		borderTopWidth: 'regular',
		color: 'content.secondary',
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'body.b3',
		'@media (width >= 640px)': {
			flexDirection: 'row',
			justifyContent: 'flex-start',
		},
	})

	export const simpleFooterSpread = style({
		'@media (width >= 640px)': { justifyContent: 'space-between' },
	})
}
