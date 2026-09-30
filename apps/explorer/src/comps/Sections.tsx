import * as React from 'react'
import { cx } from '#lib/css'
import { Pagination } from './Pagination'

export function Sections(props: Sections.Props): React.JSX.Element {
	const sectionId = React.useId()
	const {
		sections: sections_,
		activeSection = 0,
		onSectionChange,
		mode = Sections.defaultMode,
	} = props

	const sections = sections_.filter((section) => section.visible !== false)

	const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
		() =>
			new Set(
				props.defaultExpandedSection ? [props.defaultExpandedSection] : [],
			),
	)

	const toggleSection = (title: string) => {
		setExpandedSections((expanded) => {
			const next = new Set(expanded)
			if (next.has(title)) next.delete(title)
			else next.add(title)
			return next
		})
	}

	if (mode === 'stacked')
		return (
			<Sections.Context.Provider value={{ mode }}>
				<div className="flex flex-col gap-[14px]">
					{sections.map((section) => {
						const itemsLabel = section.itemsLabel ?? 'items'
						const isCollapsed =
							section.autoCollapse !== false &&
							!expandedSections.has(section.title)

						const canCollapse = section.autoCollapse !== false

						return (
							<section
								key={section.title}
								className={cx(
									'flex flex-col font-sans w-full overflow-hidden',
									'rounded-body border border-card-border bg-card-header',
									'shadow-none',
								)}
							>
								{canCollapse ? (
									<button
										type="button"
										aria-expanded={!isCollapsed}
										onClick={() => toggleSection(section.title)}
										className={cx(
											'h-[52px] flex items-center justify-between px-[18px] cursor-pointer press-down -outline-offset-2!',
											isCollapsed ? 'rounded-body!' : 'rounded-t-body!',
										)}
									>
										<h1 className="heading-16 text-primary font-sans">
											{section.title}
										</h1>
										<div className="flex items-center gap-[12px]">
											{isCollapsed && Boolean(section.totalItems) && (
												<span className="copy-13 text-tertiary">
													{section.totalItems}{' '}
													{Pagination.pluralize(
														section.totalItems ?? 0,
														itemsLabel,
													)}
												</span>
											)}
											<div
												className={cx(
													'accent copy-16 font-mono',
													isCollapsed ? 'text-accent' : 'text-tertiary',
												)}
											>
												[{isCollapsed ? '+' : '–'}]
											</div>
										</div>
									</button>
								) : (
									<div className="h-[52px] flex items-center justify-between px-[18px] rounded-t-body">
										<h1 className="heading-16 text-primary font-sans">
											{section.title}
										</h1>
										{Boolean(section.totalItems) && (
											<span className="copy-13 text-tertiary">
												{section.totalItems}{' '}
												{Pagination.pluralize(
													section.totalItems ?? 0,
													itemsLabel,
												)}
											</span>
										)}
									</div>
								)}

								{!isCollapsed && (
									<div className="rounded-t-body border-t border border-card-border bg-card -mb-px -mx-px flex flex-col min-h-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2! focus-visible:rounded-[2px]!">
										{section.contextual && (
											<div className="px-[18px] py-[10px] border-b border-solid border-card-border">
												{section.contextual}
											</div>
										)}
										{section.content}
									</div>
								)}
							</section>
						)
					})}
				</div>
			</Sections.Context.Provider>
		)

	return (
		<Sections.Context.Provider value={{ mode }}>
			<section
				className={cx(
					'flex flex-col font-sans w-full overflow-hidden min-h-0 self-start',
					'rounded-body border border-card-border bg-card-header',
					'shadow-none',
				)}
			>
				<div className="min-h-11 flex flex-wrap items-center justify-between gap-x-3">
					<div
						role="tablist"
						aria-label="Details"
						className="flex min-w-0 overflow-x-auto items-center self-stretch font-sans"
					>
						{sections.length === 1 ? (
							<div
								role="tab"
								aria-selected="true"
								id={`${sectionId}-tab-0`}
								aria-controls={`${sectionId}-panel-0`}
								tabIndex={0}
								className="h-full flex items-center gap-[8px] button-14 pl-[18px] pr-[12px] font-sans"
							>
								<span className="text-primary">{sections[0].title}</span>
								{Boolean(sections[0].totalItems) && (
									<span className="text-tertiary">
										({sections[0].totalItems})
									</span>
								)}
							</div>
						) : (
							sections.map((section, index) => (
								<button
									key={section.title}
									type="button"
									role="tab"
									aria-selected={activeSection === index}
									id={`${sectionId}-tab-${index}`}
									aria-controls={`${sectionId}-panel-${index}`}
									tabIndex={activeSection === index ? 0 : -1}
									onKeyDown={(event) => {
										const next =
											event.key === 'ArrowRight'
												? (index + 1) % sections.length
												: event.key === 'ArrowLeft'
													? (index - 1 + sections.length) % sections.length
													: event.key === 'Home'
														? 0
														: event.key === 'End'
															? sections.length - 1
															: null
										if (next === null) return
										event.preventDefault()
										onSectionChange?.(next)
										document.getElementById(`${sectionId}-tab-${next}`)?.focus()
									}}
									onClick={() => {
										if (activeSection === index) return
										onSectionChange?.(index)
									}}
									className={cx(
										'min-h-11 shrink-0 flex items-center button-14 font-sans',
										'focus-visible:-outline-offset-2! cursor-pointer',
										index === 0
											? 'pl-[18px] pr-[12px] rounded-tl-body!'
											: 'px-[12px]',
										activeSection === index ? 'text-primary' : 'text-tertiary',
									)}
								>
									<div className="relative h-full flex items-center">
										{section.title}
										{activeSection === index && (
											<div className="absolute h-px bg-accent bottom-0 left-0 right-0 -mx-[2px]" />
										)}
									</div>
								</button>
							))
						)}
					</div>
					{sections.map((section, index) => (
						<div
							key={section.title}
							className={cx('pr-[18px]', activeSection !== index && 'hidden')}
						>
							{section.contextual}
						</div>
					))}
				</div>

				{sections.map((section, index) => (
					<div
						key={section.title}
						role="tabpanel"
						id={`${sectionId}-panel-${index}`}
						aria-labelledby={`${sectionId}-tab-${index}`}
						className={cx(
							'border-t border-card-border bg-card flex flex-col min-h-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-focus focus-visible:-outline-offset-2! focus-visible:rounded-[2px]!',
							activeSection !== index && 'hidden',
						)}
					>
						{section.content}
					</div>
				))}
			</section>
		</Sections.Context.Provider>
	)
}

export namespace Sections {
	export interface Props {
		defaultExpandedSection?: string
		activeSection?: number
		mode?: Mode
		onSectionChange?: (index: number) => void
		sections: Section[]
	}

	export type Mode = 'tabs' | 'stacked'

	export interface Section {
		autoCollapse?: boolean
		content: React.ReactNode
		contextual?: React.ReactNode
		itemsLabel?: string
		title: string
		totalItems?: number | string
		visible?: boolean
	}

	export const defaultMode = 'tabs'

	export const Context = React.createContext<{ mode: Mode }>({
		mode: defaultMode,
	})

	export function useSectionsMode() {
		return React.useContext(Context).mode
	}
}
