import { ClientOnly } from '@tanstack/react-router'
import * as React from 'react'
import { cx } from '#cva.config.ts'
import { Pagination } from './Pagination'

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
								<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-[1px] -mx-[1px] flex flex-col min-h-0">
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
				'flex flex-col font-mono w-full overflow-hidden h-full min-h-0',
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

			<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-[1px] -mx-[1px] flex-1 flex flex-col min-h-0">
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
		itemsLabel?: string
		itemsPerPage?: number
	}

	export function SectionContent(props: SectionContent.Props) {
		const { section, totalPages, itemsLabel, mode } = props
		const { page, isPending, totalItems } = section

		const columns =
			mode === 'stacked' ? section.columns.stacked : section.columns.tabs
		const items = section.items(mode)

		return (
			<div className="flex flex-col h-full min-h-0">
				<div className="rounded-t-lg relative w-full overflow-x-auto">
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
					<table className="w-full border-collapse text-[14px] rounded-t-[2px] min-w-max">
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
												className={cx(
													'px-[10px] first-of-type:pl-[16px] last-of-type:pr-[16px] py-[12px] text-primary align-middle whitespace-nowrap',
													align === 'end' ? 'text-right' : 'text-left',
												)}
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

	export namespace SectionContent {
		export interface Props {
			section: Sections.Section
			totalPages: number
			itemsLabel: string
			itemsPerPage: number
			mode: 'stacked' | 'tabs'
		}
	}
}
