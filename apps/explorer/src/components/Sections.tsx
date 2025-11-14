import { ClientOnly } from '@tanstack/react-router'
import * as React from 'react'
import { cx } from '#cva.config.ts'

export function Sections(props: Sections.Props) {
	const {
		sections,
		activeSection = 0,
		onSectionChange,
		className,
		mode = 'tabs',
	} = props

	const [collapsedSections, setCollapsedSections] = React.useState<boolean[]>(
		new Array(sections.length).fill(true),
	)

	const toggleSection = (index: number) => {
		setCollapsedSections((collapsed) =>
			collapsed.map((v, i) => (i === index ? !v : v)),
		)
	}

	if (mode === 'stacked')
		return (
			<div className={cx('flex flex-col gap-[14px]', className)}>
				{sections.map((section, index) => {
					const itemsPerPage = section.itemsPerPage ?? 10
					const totalPages = Math.ceil(section.totalItems / itemsPerPage)
					const itemsLabel = section.itemsLabel ?? 'items'
					const isCollapsed = collapsedSections[index]

					return (
						<section
							key={section.title}
							className={cx(
								'flex flex-col font-mono w-full overflow-hidden',
								'rounded-[10px] border border-card-border bg-card-header',
								'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
							)}
						>
							<button
								type="button"
								onClick={() => toggleSection(index)}
								className={cx(
									'h-[54px] flex items-center justify-between px-[18px] cursor-pointer press-down -outline-offset-[2px]!',
									isCollapsed ? 'rounded-[10px]!' : 'rounded-t-[10px]!',
								)}
							>
								<h1 className="text-[13px] font-medium uppercase text-primary">
									{section.title}
								</h1>
								<div className="flex items-center gap-[12px]">
									{isCollapsed && (
										<span className="text-[13px] text-tertiary">
											{section.totalItems} {itemsLabel}
										</span>
									)}
									<div
										className={cx(
											'accent text-[16px] font-mono',
											isCollapsed ? 'text-accent' : 'text-tertiary',
										)}
									>
										[{isCollapsed ? '+' : '–'}]
									</div>
								</div>
							</button>

							{!isCollapsed && (
								<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-[1px] -mx-[1px]">
									<Sections.SectionContent
										section={section}
										totalPages={totalPages}
										itemsLabel={itemsLabel}
										itemsPerPage={itemsPerPage}
										mode="stacked"
									/>
								</div>
							)}
						</section>
					)
				})}
			</div>
		)

	const currentSection = sections[activeSection]
	if (!currentSection) return null

	const itemsPerPage = currentSection.itemsPerPage ?? 10
	const totalPages = Math.ceil(currentSection.totalItems / itemsPerPage)
	const itemsLabel = currentSection.itemsLabel ?? 'items'

	return (
		<section
			className={cx(
				'flex flex-col font-mono w-full overflow-hidden',
				'rounded-[10px] border border-card-border bg-card-header',
				'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				className,
			)}
		>
			<div className="h-[40px] flex items-center">
				{sections.map((section, index) => (
					<button
						key={section.title}
						type="button"
						onClick={() => onSectionChange?.(index)}
						className={cx(
							index === 0
								? 'pl-[18px] pr-[12px] !rounded-tl-[10px]'
								: 'px-[12px]',
							'h-full flex items-center text-[13px] font-medium uppercase',
							'focus-visible:-outline-offset-2! press-down cursor-pointer transition-[color]',
							activeSection === index
								? 'text-primary'
								: 'text-tertiary hover:text-secondary',
						)}
					>
						{section.title}
					</button>
				))}
			</div>

			<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-[1px] -mx-[1px]">
				<Sections.SectionContent
					section={currentSection}
					totalPages={totalPages}
					itemsLabel={itemsLabel}
					itemsPerPage={itemsPerPage}
					mode="tabs"
				/>
			</div>
		</section>
	)
}

export namespace Sections {
	export interface Props {
		sections: Section[]
		activeSection?: number
		onSectionChange?: (index: number) => void
		className?: string
		mode?: 'tabs' | 'stacked'
	}

	export interface Column {
		label: React.ReactNode
		align?: 'start' | 'end'
		minWidth?: number
	}

	export interface Section {
		title: string
		columns: {
			stacked: Column[]
			tabs: Column[]
		}
		items: (mode: 'stacked' | 'tabs') => Array<React.ReactNode[]>
		totalItems: number
		page: number
		isPending: boolean
		onPageChange: (page: number) => void
		itemsLabel?: string
		itemsPerPage?: number
	}

	export function SectionContent(props: SectionContent.Props) {
		const { section, totalPages, itemsLabel, mode } = props
		const { page, isPending, onPageChange, totalItems } = section

		const columns =
			mode === 'stacked' ? section.columns.stacked : section.columns.tabs
		const items = section.items(mode)

		return (
			<>
				<div className="rounded-t-lg relative w-full">
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
					<table className="w-full border-collapse text-[14px] rounded-t-[2px]">
						<thead>
							<tr className="border-dashed border-b border-card-border text-[13px] text-tertiary">
								{columns.map((column, index) => {
									const align = column.align ?? 'start'
									return (
										<th
											key={`${index}${column.label}`}
											className={`px-[10px] first-of-type:pl-[16px] last-of-type:pr-[16px] h-[40px] font-normal whitespace-nowrap ${
												align === 'end' ? 'text-right' : 'text-left'
											}`}
											style={{
												minWidth:
													column.minWidth !== undefined
														? `${column.minWidth}px`
														: undefined,
											}}
										>
											{column.label}
										</th>
									)
								})}
							</tr>
						</thead>
						<tbody className="divide-dashed divide-card-border [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-dashed [&>*:not(:last-child)]:border-card-border">
							{items.map((item, index) => (
								<tr key={`${index}${page}`} className="min-h-[48px]">
									{item.map((cell, cellIndex) => {
										const align = columns[cellIndex]?.align ?? 'start'
										const key = `${index}${page}${cellIndex}`
										return (
											<td
												key={key}
												className={`px-[10px] first-of-type:pl-[16px] last-of-type:pr-[16px] py-[12px] text-primary align-middle ${
													align === 'end' ? 'text-right' : 'text-left'
												}`}
											>
												{cell}
											</td>
										)
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<Sections.Pagination
					page={page}
					totalPages={totalPages}
					totalItems={totalItems}
					itemsLabel={itemsLabel}
					isPending={isPending}
					onPageChange={onPageChange}
					compact={mode === 'stacked'}
				/>
			</>
		)
	}

	export namespace SectionContent {
		export interface Props {
			section: Sections.Section
			totalPages: number
			itemsLabel: string
			itemsPerPage: number
			mode: 'stacked' | 'tabs'
		}
	}

	export function Pagination(props: Pagination.Props) {
		const {
			page,
			totalPages,
			totalItems,
			itemsLabel,
			isPending,
			onPageChange,
			compact = false,
		} = props

		if (compact)
			return (
				<div className="flex items-center justify-center gap-[8px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary w-full">
					<button
						type="button"
						onClick={() => onPageChange(page - 1)}
						disabled={page <= 1 || isPending}
						className="rounded-[4px] border border-border-primary px-[8px] py-[6px] text-[12px] font-medium text-primary hover:bg-alt cursor-pointer press-down disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Previous page"
					>
						Previous
					</button>

					<span className="text-primary font-medium">
						Page {page} of {totalPages}
					</span>

					<button
						type="button"
						onClick={() => onPageChange(page + 1)}
						disabled={page >= totalPages || isPending}
						className="rounded-[4px] border border-border-primary px-[12px] py-[6px] text-[12px] font-medium text-primary hover:bg-alt cursor-pointer press-down disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Next page"
					>
						{isPending ? 'Loading…' : 'Next'}
					</button>
				</div>
			)

		return (
			<div className="flex flex-col gap-[12px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary md:flex-row md:items-center md:justify-between">
				<div className="flex flex-row items-center gap-[8px]">
					<button
						type="button"
						onClick={() => onPageChange(page - 1)}
						disabled={page <= 1 || isPending}
						className="rounded-[4px] border border-border-primary px-[8px] py-[6px] text-[12px] font-medium text-primary hover:bg-alt cursor-pointer press-down disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Previous page"
					>
						Previous
					</button>

					<div className="flex items-center gap-[6px]">
						{(() => {
							const maxButtons = 5
							let startPage = Math.max(1, page - Math.floor(maxButtons / 2))
							const endPage = Math.min(totalPages, startPage + maxButtons - 1)

							startPage = Math.max(1, endPage - maxButtons + 1)

							const pages: Array<number | 'ellipsis'> = []

							if (startPage > 1) {
								pages.push(1)
								if (startPage > 2) pages.push('ellipsis')
							}

							for (let index = startPage; index <= endPage; index++)
								pages.push(index)

							if (endPage < totalPages) {
								if (endPage < totalPages - 1) pages.push('ellipsis')
								pages.push(totalPages)
							}

							let ellipsisCount = 0
							return pages.map((p) => {
								if (p === 'ellipsis') {
									ellipsisCount++
									return (
										<span
											key={`ellipsis-${ellipsisCount}`}
											className="text-tertiary px-[4px]"
										>
											…
										</span>
									)
								}
								return (
									<button
										key={p}
										type="button"
										onClick={() => onPageChange(p)}
										disabled={page === p || isPending}
										className={`rounded-[4px] flex w-[28px] h-[28px] items-center justify-center ${
											page === p
												? 'border border-accent/50 text-primary cursor-default'
												: 'cursor-pointer press-down hover:bg-alt text-primary'
										} ${isPending && page !== p ? 'opacity-50 cursor-not-allowed' : ''}`}
									>
										{p}
									</button>
								)
							})
						})()}
					</div>

					<button
						type="button"
						onClick={() => onPageChange(page + 1)}
						disabled={page >= totalPages || isPending}
						className="rounded-[4px] border border-border-primary px-[12px] py-[6px] text-[12px] font-medium text-primary hover:bg-alt cursor-pointer press-down disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Next page"
					>
						{isPending ? 'Loading…' : 'Next'}
					</button>
				</div>

				<div className="space-x-[8px]">
					<span className="text-tertiary">Page</span>
					<span className="text-primary">{page}</span>
					<span className="text-tertiary">of</span>
					<span className="text-primary">{totalPages}</span>
					<span className="text-tertiary">•</span>
					<span className="text-primary">{totalItems || '…'}</span>
					<span className="text-tertiary">
						<ClientOnly fallback={<React.Fragment>…</React.Fragment>}>
							{totalItems === 1 ? itemsLabel.replace(/s$/, '') : itemsLabel}
						</ClientOnly>
					</span>
				</div>
			</div>
		)
	}

	export namespace Pagination {
		export interface Props {
			page: number
			totalPages: number
			totalItems: number
			itemsLabel: string
			isPending: boolean
			onPageChange: (page: number) => void
			compact?: boolean
		}
	}
}
