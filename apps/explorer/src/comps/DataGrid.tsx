import { Link } from '@tanstack/react-router'
import * as React from 'react'
import { Pagination } from '#comps/Pagination'
import { Sections } from '#comps/Sections'
import { cx } from '#cva.config'

export function DataGrid(props: DataGrid.Props) {
	const {
		columns,
		items,
		totalItems,
		displayCount,
		page,
		fetching = false,
		loading = false,
		countLoading = false,
		disableLastPage = false,
		itemsLabel = 'items',
		itemsPerPage = 10,
		pagination = 'default',
		emptyState = 'No items found.',
		flexible = false,
	} = props

	const mode = Sections.useSectionsMode()
	const activeColumns = mode === 'stacked' ? columns.stacked : columns.tabs
	const activeItems: DataGrid.Row[] = loading
		? Array.from({ length: itemsPerPage }, (_, index) => ({
				cells: activeColumns.map((_, colIndex) => {
					const cellKey = `skeleton-${index}-${colIndex}`
					return <div key={cellKey} className="h-[20px]" />
				}),
			}))
		: items(mode)
	const totalPages = Math.ceil(totalItems / itemsPerPage)

	const gridTemplateColumns = activeColumns
		.map((col) => {
			if (typeof col.width === 'number') return `${col.width}px`
			if (typeof col.width === 'string')
				return col.minWidth
					? `minmax(${col.minWidth}px, ${col.width})`
					: col.width
			if (col.minWidth) return `minmax(${col.minWidth}px, auto)`
			return mode === 'tabs' ? 'minmax(0, auto)' : 'auto'
		})
		.join(' ')

	return (
		<div className="flex flex-col min-h-0">
			<div className="relative w-full">
				<div
					className={cx(
						'w-full text-[14px] rounded-t-[2px] grid',
						flexible && 'min-w-max',
						mode === 'tabs' && 'max-w-full',
					)}
					style={{ gridTemplateColumns }}
				>
					<div className="grid col-span-full border-b border-dashed border-distinct grid-cols-subgrid">
						{activeColumns.map((column, index) => {
							const key = `header-${index}`
							return (
								<div
									key={key}
									className={cx(
										'px-[10px] first:pl-[16px] last:pr-[16px] h-[40px] flex items-center',
										'text-[13px] text-tertiary font-normal whitespace-nowrap',
										column.align === 'end' ? 'justify-end' : 'justify-start',
									)}
								>
									{column.label}
								</div>
							)
						})}
					</div>
					{activeItems.length === 0 ? (
						<div
							className="px-[16px] py-[32px] text-tertiary col-span-full flex items-center justify-center"
							style={{ minHeight: itemsPerPage * 49 }}
						>
							{emptyState}
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
								key={`row-${rowIndex}-${page}`}
								className={cx(
									'grid col-span-full relative grid-cols-subgrid grid-flow-row border-b border-dashed border-distinct border-l-[3px] border-l-transparent [border-left-style:solid] last:border-b-0',
									item.link &&
										'hover:bg-base-alt hover:border-solid transition-[background-color] duration-75 hover:-mt-px hover:border-t hover:border-t-distinct',
									item.expanded && 'border-l-distinct',
									item.className,
								)}
							>
								{item.link && (
									<Link
										to={item.link.href}
										search={item.link.search}
										title={item.link.title}
										className="absolute inset-0 -left-[3px] z-0 [&:active~div]:translate-y-[0.5px] -outline-offset-2!"
									/>
								)}
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
														className={cx(
															'px-[10px] py-[12px] flex items-start min-h-[48px]',
															'text-primary',
															isFirstColumn && 'pl-[16px]',
															isLastColumn && 'pr-[16px]',
															column?.align === 'end'
																? 'justify-end'
																: 'justify-start',
															item.link &&
																'pointer-events-none [&_a]:pointer-events-auto [&_a]:relative [&_a]:z-1 [&_button]:pointer-events-auto [&_button]:relative [&_button]:z-1',
															mode === 'tabs' && 'min-w-0 overflow-hidden',
														)}
													>
														{content}
													</div>
												)
											})}
											{lineIndex < maxLines - 1 && (
												<div className="col-span-full border-b border-dashed border-distinct" />
											)}
										</React.Fragment>
									)
								})}
								{item.expanded && typeof item.expanded !== 'boolean' && (
									<div className="col-span-full px-[16px] pb-[12px] contain-[inline-size] -mt-[4px]">
										{item.expanded}
									</div>
								)}
							</div>
						)
					})}
				</div>
			</div>
			<div className="mt-auto">
				{pagination === 'simple' ? (
					<div className="flex flex-col items-center sm:flex-row sm:justify-between gap-[12px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary">
						<Pagination.Simple
							page={page}
							totalPages={totalPages}
							fetching={fetching && !loading}
							countLoading={countLoading}
							disableLastPage={disableLastPage}
						/>
						{/* Show transaction count - loading state shown while fetching */}
						<Pagination.Count
							totalItems={displayCount ?? 0}
							itemsLabel={itemsLabel}
							loading={loading || displayCount == null}
						/>
					</div>
				) : (
					<Pagination
						page={page}
						totalPages={totalPages}
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
		width?: number | `${number}fr`
	}

	export interface RowLink {
		href: string
		search?: Record<string, unknown>
		title: string
	}

	export type Cell = React.ReactNode | React.ReactNode[]

	export interface Row {
		cells: Cell[]
		link?: RowLink
		expanded?: boolean | React.ReactNode
		className?: string
	}

	export interface Props {
		columns: {
			stacked: Column[]
			tabs: Column[]
		}
		items: (mode: Sections.Mode) => Row[]
		totalItems: number
		/** Optional separate count for display (e.g., exact transaction count) */
		displayCount?: number
		page: number
		fetching?: boolean
		loading?: boolean
		countLoading?: boolean
		/** Disable "Last page" button when we can't reliably navigate there */
		disableLastPage?: boolean
		itemsLabel?: string
		itemsPerPage?: number
		pagination?: 'default' | 'simple'
		emptyState?: React.ReactNode
		flexible?: boolean
	}
}
