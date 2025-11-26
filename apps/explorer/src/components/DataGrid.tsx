import { ClientOnly, Link } from '@tanstack/react-router'
import * as React from 'react'
import { cx } from '#cva.config.ts'
import { Pagination } from './Pagination'
import { Sections } from './Sections'

export function DataGrid(props: DataGrid.Props) {
	const {
		columns,
		items,
		totalItems,
		page,
		isPending,
		itemsLabel = 'items',
		itemsPerPage = 10,
	} = props

	const mode = Sections.useSectionsMode()
	const activeColumns = mode === 'stacked' ? columns.stacked : columns.tabs
	const activeItems = items(mode)
	const totalPages = Math.ceil(totalItems / itemsPerPage)

	const gridTemplateColumns = activeColumns
		.map((col) => (col.minWidth ? `minmax(${col.minWidth}px, auto)` : 'auto'))
		.join(' ')

	return (
		<div className="flex flex-col h-full min-h-0">
			<div className="relative w-full">
				<ClientOnly>
					{isPending && (
						<>
							<div className="absolute top-0 left-0 right-0 h-[2px] bg-accent/30 z-10">
								<div className="h-full w-1/4 bg-accent animate-pulse" />
							</div>
							<div className="absolute inset-0 bg-black-white/5 pointer-events-none z-5" />
						</>
					)}
				</ClientOnly>
				<div
					className="w-full text-[14px] rounded-t-[2px] min-w-max grid"
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
									'grid col-span-full relative grid-cols-subgrid grid-flow-row border-b border-dashed border-distinct border-l-[3px] border-l-transparent [border-left-style:solid]',
									item.link &&
										'hover:bg-base-alt hover:border-solid transition-[background-color] duration-75 hover:-mt-[1px] hover:border-t hover:border-t-distinct',
									item.expanded && 'border-l-distinct',
								)}
							>
								{item.link && (
									<Link
										to={item.link.href}
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
															'px-[10px] py-[12px] flex items-start',
															'text-primary',
															isFirstColumn && 'pl-[16px]',
															isLastColumn && 'pr-[16px]',
															column?.align === 'end'
																? 'justify-end'
																: 'justify-start',
															item.link &&
																'pointer-events-none [&_a]:pointer-events-auto [&_a]:relative [&_a]:z-[1] [&_button]:pointer-events-auto [&_button]:relative [&_button]:z-[1]',
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
							</div>
						)
					})}
				</div>
			</div>
			<div className="mt-auto">
				<Pagination
					page={page}
					totalPages={totalPages}
					totalItems={totalItems}
					itemsLabel={itemsLabel}
					isPending={isPending}
					compact={mode === 'stacked'}
				/>
			</div>
		</div>
	)
}

export namespace DataGrid {
	export interface Column {
		label: React.ReactNode
		align?: 'start' | 'end'
		minWidth?: number
	}

	export interface RowLink {
		href: string
		title: string
	}

	export type Cell = React.ReactNode | React.ReactNode[]

	export interface Row {
		cells: Cell[]
		link?: RowLink
		expanded?: boolean
	}

	export interface Props {
		columns: {
			stacked: Column[]
			tabs: Column[]
		}
		items: (mode: Sections.Mode) => Row[]
		totalItems: number
		page: number
		isPending: boolean
		itemsLabel?: string
		itemsPerPage?: number
	}
}
