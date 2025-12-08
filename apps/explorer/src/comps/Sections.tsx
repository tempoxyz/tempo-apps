import * as React from 'react'
import { cx } from '#cva.config.ts'

export function Sections(props: Sections.Props) {
	const {
		sections,
		activeSection = 0,
		onSectionChange,
		className,
		mode = Sections.defaultMode,
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
			<Sections.Context.Provider value={{ mode }}>
				<div className={cx('flex flex-col gap-[14px]', className)}>
					{sections.map((section, index) => {
						const itemsLabel = section.itemsLabel ?? 'items'
						const isCollapsed =
							section.autoCollapse !== false && collapsedSections[index]

						const canCollapse = section.autoCollapse !== false

						return (
							<section
								key={section.title}
								className={cx(
									'flex flex-col font-mono w-full overflow-hidden',
									'rounded-[10px] border border-card-border bg-card-header',
									'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
								)}
							>
								{canCollapse ? (
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
								) : (
									<div className="h-[54px] flex items-center justify-between px-[18px] rounded-t-[10px]">
										<h1 className="text-[13px] font-medium uppercase text-primary">
											{section.title}
										</h1>
									</div>
								)}

								{!isCollapsed && (
									<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-[1px] -mx-[1px] flex flex-col min-h-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2! focus-visible:rounded-[2px]!">
										{section.contextual && (
											<div className="px-[18px] py-[10px] border-b border-dashed border-card-border">
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

	const currentSection = sections[activeSection]
	if (!currentSection)
		throw new Error(`Invalid activeSection index: ${activeSection}`)

	return (
		<Sections.Context.Provider value={{ mode }}>
			<section
				className={cx(
					'flex flex-col font-mono w-full overflow-hidden min-h-0 self-start',
					'rounded-[10px] border border-card-border bg-card-header',
					'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
					className,
				)}
			>
				<div className="h-[40px] flex items-center justify-between">
					<div className="flex items-center h-full">
						{sections.length === 1 ? (
							<div className="h-full flex items-center gap-[8px] text-[13px] font-medium pl-[18px] pr-[12px]">
								<span className="text-primary">{sections[0].title}</span>
								<span className="text-tertiary">
									({sections[0].totalItems})
								</span>
							</div>
						) : (
							sections.map((section, index) => (
								<button
									key={section.title}
									type="button"
									onClick={() => onSectionChange?.(index)}
									className={cx(
										'h-full flex items-center text-[13px] font-medium',
										'focus-visible:-outline-offset-2! press-down cursor-pointer transition-[color]',
										index === 0
											? 'pl-[18px] pr-[12px] !rounded-tl-[10px]'
											: 'px-[12px]',
										activeSection === index
											? 'text-primary'
											: 'text-tertiary hover:text-secondary',
									)}
								>
									<div className="relative h-full flex items-center">
										{section.title}
										{activeSection === index && (
											<div className="absolute h-[2px] bg-accent -bottom-[1.5px] left-0 right-0 -mx-[2px]" />
										)}
									</div>
								</button>
							))
						)}
					</div>
					{currentSection.contextual && (
						<div className="pr-[18px]">{currentSection.contextual}</div>
					)}
				</div>

				<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-[1px] -mx-[1px] flex flex-col min-h-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2! focus-visible:rounded-[2px]!">
					{currentSection.content}
				</div>
			</section>
		</Sections.Context.Provider>
	)
}

export namespace Sections {
	export interface Props {
		sections: Section[]
		activeSection?: number
		onSectionChange?: (index: number) => void
		className?: string
		mode?: Mode
	}

	export type Mode = 'tabs' | 'stacked'

	export interface Section {
		title: string
		content: React.ReactNode
		totalItems: number
		itemsLabel?: string
		contextual?: React.ReactNode
		autoCollapse?: boolean
	}

	export const defaultMode = 'tabs'

	export const Context = React.createContext<{
		mode: Mode
	}>({ mode: defaultMode })

	export function useSectionsMode() {
		const { mode } = React.useContext(Context)
		return mode
	}
}
