import * as React from 'react'
import { cx } from '#lib/css'

export function Sections(props: Sections.Props) {
	const {
		sections: sections_,
		activeSection = 0,
		onSectionChange,
		mode = Sections.defaultMode,
	} = props

	const sections = sections_.filter((section) => section.visible !== false)

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
				<div className="flex flex-col gap-[14px]">
					{sections.map((section, index) => {
						const itemsLabel = section.itemsLabel ?? 'items'
						const isCollapsed =
							section.autoCollapse !== false && collapsedSections[index]

						const canCollapse = section.autoCollapse !== false

						return (
							<section
								key={section.title}
								className={cx(
									'flex flex-col font-sans w-full overflow-hidden',
									'rounded-[10px] border border-card-border bg-card-header',
									'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
								)}
							>
								{canCollapse ? (
									<button
										type="button"
										onClick={() => toggleSection(index)}
										className={cx(
											'h-[52px] flex items-center justify-between px-[18px] cursor-pointer press-down -outline-offset-2!',
											isCollapsed ? 'rounded-[10px]!' : 'rounded-t-[10px]!',
										)}
									>
										<h1 className="text-[13px] font-medium text-primary font-sans">
											{section.title}
										</h1>
										<div className="flex items-center gap-[12px]">
											{isCollapsed && Boolean(section.totalItems) && (
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
									<div className="h-[52px] flex items-center justify-between px-[18px] rounded-t-[10px]">
										<h1 className="text-[13px] font-medium text-primary font-sans">
											{section.title}
										</h1>
									</div>
								)}

								{!isCollapsed && (
									<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-px -mx-px flex flex-col min-h-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2! focus-visible:rounded-[2px]!">
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

	return (
		<Sections.Context.Provider value={{ mode }}>
			<section
				className={cx(
					'flex flex-col font-sans w-full overflow-hidden min-h-0 self-start',
					'rounded-[10px] border border-card-border bg-card-header',
					'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				)}
			>
				<div className="h-[36px] flex items-center justify-between">
					<div className="flex items-center h-full font-sans">
						{sections.length === 1 ? (
							<div className="h-full flex items-center gap-[8px] text-[13px] font-medium pl-[18px] pr-[12px] font-sans">
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
									onPointerDown={() => {
										if (activeSection === index) return
										onSectionChange?.(index)
									}}
									className={cx(
										'h-full flex items-center text-[13px] font-medium font-sans',
										'focus-visible:-outline-offset-2! cursor-pointer',
										index === 0
											? 'pl-[18px] pr-[12px] rounded-tl-[10px]!'
											: 'px-[12px]',
										activeSection === index ? 'text-primary' : 'text-tertiary',
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
						className={cx(
							'rounded-t-[10px] border-t border-card-border bg-card flex flex-col min-h-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2! focus-visible:rounded-[2px]!',
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
