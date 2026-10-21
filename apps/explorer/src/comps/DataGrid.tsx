import { Link, useRouterState } from '@tanstack/react-router'
import { Empty, Rows, Skeleton, style, Table, variants } from '@tempoxyz/ds'
import { ArrowDown, ArrowUp } from '@tempoxyz/ds/icons'
import * as React from 'react'
import { cx } from 'zyzz'
import { Pagination } from '#comps/Pagination'
import { Sections } from '#comps/Sections'
import { useNewLiveRows } from '#lib/use-new-live-rows'
import { rowShimmer } from '#styles/explorer'

const skeletonWidths = ['60%', '45%', '70%', '50%'] as const

/** Lifts a linked row's own links and buttons above its row link. */
const raised = {
	'& :is(a, button):not([data-row-link])': {
		pointerEvents: 'auto',
		position: 'relative',
		zIndex: 1,
	},
} as const

/**
 * The records of a `Sections` card: a dense table with its pagination below,
 * following the TDS Tables and Lists pattern. In the stacked layout a table
 * with more than three columns turns into a list, one stacked item per row.
 * A row with `link` opens its record from anywhere in the row, and links and
 * buttons inside the row keep working.
 */
export function DataGrid(props: DataGrid.Props): React.JSX.Element {
	const {
		columns: columns_,
		items,
		totalItems,
		pages: pagesProp,
		displayCount,
		displayCountCapped = false,
		page,
		loading = false,
		countLoading = false,
		itemsLabel = 'items',
		itemsPerPage = 10,
		pagination = 'default',
		showSimpleCount = true,
		emptyState = 'No items found',
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
	const busy = loading || isSearchNavigationPending
	const columns = mode === 'stacked' ? columns_.stacked : columns_.tabs
	const rows = busy ? [] : items(mode)
	const newLiveRows = useNewLiveRows(
		rows.map((row) => row.key),
		busy ? undefined : props.liveScope,
	)
	const pages = pagesProp ?? Math.ceil(totalItems / itemsPerPage)
	const label = itemsLabel.charAt(0).toUpperCase() + itemsLabel.slice(1)
	// TDS Tables and Lists, Below 640px: tables with more than two or three
	// columns do not fit a phone, so each row becomes a stacked list item.
	const list = mode === 'stacked' && columns.length > 3
	const first = (page - 1) * itemsPerPage + 1
	const range =
		rows.length > 0 ? ([first, first + rows.length - 1] as const) : undefined

	const footer = (() => {
		if (pagination === 'default')
			return (
				<Pagination
					page={page}
					pages={typeof pages === 'number' ? pages : 1}
					range={range}
					totalItems={totalItems}
					itemsLabel={itemsLabel}
					compact={mode === 'stacked'}
				/>
			)
		if (pagination !== 'simple') return pagination
		const singlePage = typeof pages === 'number' && pages <= 1 && page === 1
		if (singlePage && !countLoading && !showSimpleCount) return null
		return (
			<div {...styles.bar()}>
				{showSimpleCount && (
					<Pagination.Count
						range={singlePage ? undefined : range}
						totalItems={displayCount ?? 0}
						itemsLabel={itemsLabel}
						loading={busy || displayCount == null}
						capped={displayCountCapped}
					/>
				)}
				<Pagination.Simple
					page={page}
					pages={pages}
					pagesCapped={displayCountCapped}
					countLoading={countLoading}
					onPrefetchNext={onPrefetchNextPage}
					onCancelPrefetchNext={onCancelPrefetchNextPage}
					showPageLabel={showSimplePageLabel}
				/>
			</div>
		)
	})()

	const empty = (
		<Empty.Root>
			<Empty.Title>{emptyState}</Empty.Title>
		</Empty.Root>
	)

	const rowLink = (link: DataGrid.RowLink) => (
		<Link
			to={link.href}
			search={link.search}
			title={link.title}
			aria-label={link.title}
			preload="intent"
			data-row-link=""
			{...styles.rowLink()}
		/>
	)

	return (
		<div {...styles.root()}>
			<div {...styles.bleed()}>
				{list ? (
					busy ? (
						<Rows.Root dividers="full" size="small">
							<Rows.RowGroupLoader aria-label={`Loading ${itemsLabel}`} />
						</Rows.Root>
					) : rows.length === 0 ? (
						empty
					) : (
						<Rows.Root
							aria-label={label}
							dividers="full"
							role="list"
							size="small"
						>
							{rows.map((row, rowIndex) => {
								// Values beside the first of each side keep their column
								// name, since the list has no header row.
								const labelled = (side: 'start' | 'end') =>
									row.cells.flatMap((cell, index) => {
										const column = columns[index]
										if ((column?.align ?? 'start') !== side) return []
										const key = `cell-${index}`
										return [
											{
												cell,
												key,
												label: column?.label,
												primary: column?.primary,
											},
										] as const
									})
								// The primary column titles the item; stable sort keeps the rest in order.
								const [main, ...details] = labelled('start').sort(
									(a, b) =>
										Number(Boolean(b.primary)) - Number(Boolean(a.primary)),
								)
								const [amount, ...extras] = labelled('end')
								const named = (item: (typeof details)[number]) =>
									typeof item.label === 'string' ? (
										<span {...styles.named()}>
											<span {...styles.name()}>{item.label}</span>
											{item.cell}
										</span>
									) : (
										item.cell
									)
								return (
									<React.Fragment key={row.key ?? `row-${rowIndex}-${page}`}>
										<Rows.Row
											role="listitem"
											{...cx(
												styles.row({ className: row.className }),
												Boolean(row.link) && styles.linkedItem(),
												row.key !== undefined &&
													newLiveRows.has(row.key) &&
													styles.added(),
											)}
										>
											{row.link && rowLink(row.link)}
											<Rows.Info>
												<Rows.Title>{main?.cell}</Rows.Title>
												{details.map((detail) => (
													<Rows.Description key={detail.key}>
														{named(detail)}
													</Rows.Description>
												))}
											</Rows.Info>
											{amount && (
												<span {...styles.end()}>
													{amount.cell}
													{extras.map((extra) => (
														<Rows.Description key={extra.key}>
															{named(extra)}
														</Rows.Description>
													))}
												</span>
											)}
										</Rows.Row>
										{row.expanded && typeof row.expanded !== 'boolean' && (
											<Rows.Panel role="listitem">{row.expanded}</Rows.Panel>
										)}
									</React.Fragment>
								)
							})}
						</Rows.Root>
					)
				) : (
					<Table.Root
						aria-busy={busy}
						aria-label={label}
						interactive={rows.some((row) => row.link)}
						size="small"
						{...cx(flexible && styles.flexible())}
					>
						<Table.Head>
							<Table.Row>
								{columns.map((column, index) => {
									const key = `column-${index}`
									const SortIcon =
										column.sortDirection === 'asc'
											? ArrowUp
											: column.sortDirection === 'desc'
												? ArrowDown
												: undefined
									return (
										<Table.HeaderCell
											key={key}
											aria-sort={
												column.sortDirection === 'asc'
													? 'ascending'
													: column.sortDirection === 'desc'
														? 'descending'
														: undefined
											}
											justify={column.align ?? 'start'}
											style={DataGrid.columnStyle(column)}
										>
											<span {...styles.label()}>
												{column.label}
												{SortIcon && <SortIcon aria-hidden="true" />}
											</span>
										</Table.HeaderCell>
									)
								})}
							</Table.Row>
						</Table.Head>
						<Table.Body>
							{busy ? (
								Array.from(
									{ length: Math.min(itemsPerPage, 5) },
									(_, rowIndex) => (
										<Table.Row key={`skeleton-${rowIndex.toString()}`}>
											{columns.map((column, index) => {
												const key = `skeleton-${index}`
												const align = column.align ?? 'start'
												const width =
													index === 0
														? skeletonWidths[rowIndex % skeletonWidths.length]
														: align === 'end'
															? '5rem'
															: '4rem'
												return (
													<Table.Cell key={key} justify={align}>
														<Skeleton
															shape="pill"
															{...styles.skeleton({ align, style: { width } })}
														/>
													</Table.Cell>
												)
											})}
										</Table.Row>
									),
								)
							) : rows.length === 0 ? (
								<Table.Row>
									<Table.Cell colSpan={columns.length}>{empty}</Table.Cell>
								</Table.Row>
							) : (
								rows.map((row, rowIndex) => (
									<React.Fragment key={row.key ?? `row-${rowIndex}-${page}`}>
										<Table.Row
											{...cx(
												styles.row({ className: row.className }),
												Boolean(row.link) && styles.linked(),
												row.key !== undefined &&
													newLiveRows.has(row.key) &&
													styles.added(),
											)}
										>
											{row.cells.map((cell, index) => {
												const key = `cell-${index}`
												const column = columns[index]
												return (
													<Table.Cell
														key={key}
														justify={column?.align ?? 'start'}
														{...cx(
															column?.width === 'max-content' &&
																styles.nowrap(),
														)}
													>
														{row.link && index === 0 && rowLink(row.link)}
														{cell}
													</Table.Cell>
												)
											})}
										</Table.Row>
										{row.expanded && typeof row.expanded !== 'boolean' && (
											<Table.Row>
												<Table.Cell colSpan={columns.length}>
													<div {...styles.expanded()}>{row.expanded}</div>
												</Table.Cell>
											</Table.Row>
										)}
									</React.Fragment>
								))
							)}
						</Table.Body>
					</Table.Root>
				)}
			</div>
			{footer ? <div {...styles.footer()}>{footer}</div> : null}
		</div>
	)
}

export namespace DataGrid {
	export interface Column {
		label: React.ReactNode
		/** `end` aligns the column and its header to the end, for amounts and counts. */
		align?: 'start' | 'end'
		/**
		 * A px width, `max-content` to keep the content on one line, or a share
		 * such as `1fr`, which leaves the column to size to its content.
		 */
		width?: number | `${number}fr` | 'max-content'
		sortDirection?: 'asc' | 'desc'
		/** Titles each item in the narrow list layout. Defaults to the first start column. */
		primary?: boolean
	}

	export interface RowLink {
		href: string
		search?: Record<string, unknown>
		title: string
	}

	/** A cell's content. An array renders its items in order. */
	export type Cell = React.ReactNode | React.ReactNode[]

	export interface Row {
		/** Stable identity for the row; falls back to the row index when omitted. */
		key?: string
		cells: Cell[]
		/** Opens the record from anywhere in the row. */
		link?: RowLink
		/** Details shown below the row, across its full width. */
		expanded?: boolean | React.ReactNode
		className?: string
	}

	export interface Props {
		/** Enables new-row highlights, resetting when the feed scope changes. */
		liveScope?: string | undefined
		/**
		 * Columns for the wide layout (`tabs`) and the narrow one (`stacked`).
		 * More than three stacked columns render as a list: the first start
		 * column is the title, other start columns sit beneath it, and end
		 * columns stack at the end, the first one on top. Values other than
		 * the title and the first end value show their string column labels.
		 */
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
		/** Whether the display count is capped (shows "1,000+") */
		displayCountCapped?: boolean
		page: number
		loading?: boolean
		countLoading?: boolean
		onPrefetchNextPage?: () => void
		onCancelPrefetchNextPage?: () => void
		showSimplePageLabel?: boolean
		itemsLabel?: string
		itemsPerPage?: number
		pagination?: 'default' | 'simple' | React.ReactNode
		showSimpleCount?: boolean
		emptyState?: React.ReactNode
		/** Keeps every column at its content width and scrolls instead of truncating. */
		flexible?: boolean
	}

	/** The header cell width for a column. Shares (`1fr`) leave sizing to the table. */
	export function columnStyle(column: Column): React.CSSProperties | undefined {
		if (typeof column.width === 'number') return { width: column.width }
		if (column.width === 'max-content') return { width: 1 }
		return undefined
	}
}

namespace styles {
	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		minHeight: '0',
		minWidth: '0',
	})

	// `Surface` bleeds a direct child table or `Rows` into its padding, so row
	// fills and dividers reach its edges. The records sit one level down, so
	// they bleed the same way into the medium `Sections` card. A table wider
	// than the card scrolls here rather than widening the page.
	export const bleed = style({
		marginInline: '-16px !custom',
		overflowX: 'auto',
	})

	export const flexible = style({ minWidth: 'max-content !custom' })

	export const label = style({
		alignItems: 'center',
		columnGap: '4',
		display: 'inline-flex',
	})

	export const nowrap = style({ whiteSpace: 'nowrap' })

	export const skeleton = variants({
		base: { height: '12' },
		defaultVariants: { align: 'start' },
		variants: {
			align: {
				end: { marginInlineStart: 'auto !custom' },
				start: {},
			},
		},
	})

	// Positions the row link, which covers the row.
	export const row = style({ position: 'relative' })

	// Clicks on plain content reach the row link; links and buttons in the row
	// sit above it and keep their own targets.
	export const linked = style({
		selectors: { '& > td': { pointerEvents: 'none' }, ...raised },
	})

	// The hover fill of a pressable `Rows.Row`.
	export const linkedItem = style({
		selectors: {
			'& > *': { pointerEvents: 'none' },
			'&:hover': { backgroundColor: 'grayAlpha.100' },
			...raised,
		},
	})

	export const rowLink = style({
		inset: '0',
		outlineOffset: '-2px !custom',
		pointerEvents: 'auto',
		position: 'absolute',
	})

	export const added = style({
		animation: `${rowShimmer} 0.5s ease-out 1 !custom`,
	})

	// Wide details wrap inside the row instead of widening the table.
	export const expanded = style({ contain: 'inline-size' })

	// The end of a stacked item, as in the TDS Below 640px example. It keeps
	// its width up to half the item, where a hash truncates.
	export const end = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexDirection: 'column',
		flexShrink: '0 !custom',
		maxWidth: '50% !custom',
		rowGap: '4',
		textAlign: 'end',
	})

	// A column name before its value in a stacked item, on one line: a hash
	// truncates to the space left beside the name.
	export const named = style({
		alignItems: 'baseline',
		columnGap: '4',
		display: 'flex',
		minWidth: '0',
	})

	export const name = style({ flexShrink: '0 !custom' })

	export const footer = style({ marginTop: 'auto !custom', paddingTop: '12' })

	export const bar = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		justifyContent: 'space-between',
	})
}
