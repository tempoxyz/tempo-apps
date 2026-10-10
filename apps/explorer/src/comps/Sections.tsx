import { style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
import { link, pressDown } from '#styles/explorer'
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
				<div {...styles.stack()}>
					{sections.map((section) => {
						const itemsLabel = section.itemsLabel ?? 'items'
						const isCollapsed =
							section.autoCollapse !== false &&
							!expandedSections.has(section.title)

						const canCollapse = section.autoCollapse !== false

						return (
							<section key={section.title} {...styles.section()}>
								{canCollapse ? (
									<button
										type="button"
										aria-expanded={!isCollapsed}
										onClick={() => toggleSection(section.title)}
										{...cx(
											styles.toggle(),
											pressDown(),
											isCollapsed && styles.toggleCollapsed(),
											!isCollapsed && styles.toggleExpanded(),
										)}
									>
										<h1 {...styles.title()}>{section.title}</h1>
										<div {...styles.toggleMeta()}>
											{isCollapsed && Boolean(section.totalItems) && (
												<span {...styles.count()}>
													{section.totalItems}{' '}
													{Pagination.pluralize(
														section.totalItems ?? 0,
														itemsLabel,
													)}
												</span>
											)}
											<div
												{...cx(
													styles.indicator(),
													isCollapsed && link(),
													!isCollapsed && styles.indicatorExpanded(),
												)}
											>
												[{isCollapsed ? '+' : '–'}]
											</div>
										</div>
									</button>
								) : (
									<div {...styles.header()}>
										<h1 {...styles.title()}>{section.title}</h1>
										{Boolean(section.totalItems) && (
											<span {...styles.count()}>
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
									<div {...cx(styles.content(), styles.contentStacked())}>
										{section.contextual && (
											<div {...styles.contextual()}>{section.contextual}</div>
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
			<section {...cx(styles.section(), styles.sectionTabs())}>
				<div {...styles.tabsHeader()}>
					<div role="tablist" aria-label="Details" {...styles.tabList()}>
						{sections.length === 1 ? (
							<div
								role="tab"
								aria-selected="true"
								id={`${sectionId}-tab-0`}
								aria-controls={`${sectionId}-panel-0`}
								tabIndex={0}
								{...styles.singleTab()}
							>
								<span {...styles.primary()}>{sections[0].title}</span>
								{Boolean(sections[0].totalItems) && (
									<span {...styles.tertiary()}>({sections[0].totalItems})</span>
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
									{...cx(
										styles.tab(),
										index === 0 && styles.tabFirst(),
										activeSection === index && styles.tabActive(),
									)}
								>
									<div {...styles.tabLabel()}>
										{section.title}
										{activeSection === index && (
											<div {...styles.tabIndicator()} />
										)}
									</div>
								</button>
							))
						)}
					</div>
					{sections.map((section, index) => (
						<div
							key={section.title}
							{...cx(
								styles.tabContextual(),
								activeSection !== index && styles.hidden(),
							)}
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
						{...cx(
							styles.content(),
							activeSection !== index && styles.hidden(),
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

namespace styles {
	export const stack = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
	})

	export const section = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		boxShadow: 'none',
		display: 'flex',
		flexDirection: 'column',
		fontFamily: 'Pilat, Arial, sans-serif',
		overflow: 'hidden',
		width: '100% !custom',
	})

	export const sectionTabs = style({
		alignSelf: 'flex-start',
		minHeight: '0 !custom',
	})

	// The focus ring rules are `!important`, like the former Tailwind
	// modifiers, so they beat the global focus ring.
	export const toggle = style({
		alignItems: 'center',
		cursor: 'pointer',
		display: 'flex',
		height: '52px !custom',
		justifyContent: 'space-between',
		outlineOffset: '-2px !important',
		paddingInline: '20',
	})

	export const toggleCollapsed = style({ borderRadius: 'xs !important' })

	export const toggleExpanded = style({
		borderBottomLeftRadius: 'none !important',
		borderBottomRightRadius: 'none !important',
		borderTopLeftRadius: 'xs !important',
		borderTopRightRadius: 'xs !important',
	})

	export const title = style({
		color: 'content.primary',
		typography: 'heading.h4',
	})

	export const toggleMeta = style({
		alignItems: 'center',
		display: 'flex',
		gap: '12',
	})

	export const count = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const indicator = style({
		fontFamily: '"JetBrains Mono", monospace',
		fontSize: '16px',
		fontWeight: 400,
		letterSpacing: '0px',
		lineHeight: '22px',
	})

	export const indicatorExpanded = style({ color: 'content.tertiary' })

	export const header = style({
		alignItems: 'center',
		borderTopLeftRadius: 'xs',
		borderTopRightRadius: 'xs',
		display: 'flex',
		height: '52px !custom',
		justifyContent: 'space-between',
		paddingInline: '20',
	})

	export const content = style({
		backgroundColor: 'background.secondary',
		borderTopColor: 'line.secondary',
		borderTopStyle: 'solid',
		borderTopWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		minHeight: '0 !custom',
		overflowX: 'auto',
		':focus-visible': {
			borderRadius: '2px !custom !important',
			outlineColor: 'border.focus',
			outlineOffset: '-2px !important',
			outlineStyle: 'solid',
			outlineWidth: '2px',
		},
	})

	export const contentStacked = style({
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopLeftRadius: 'xs',
		borderTopRightRadius: 'xs',
		borderWidth: 'regular',
		marginBottom: '-1px !custom',
		marginInline: '-1px !custom',
	})

	export const contextual = style({
		borderBottomColor: 'line.secondary',
		borderBottomStyle: 'solid',
		borderBottomWidth: 'regular',
		paddingBlock: '12',
		paddingInline: '20',
	})

	export const tabsHeader = style({
		alignItems: 'center',
		columnGap: '12',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		minHeight: '44px !custom',
	})

	export const tabList = style({
		alignItems: 'center',
		alignSelf: 'stretch',
		display: 'flex',
		minWidth: '0 !custom',
		overflowX: 'auto',
	})

	export const singleTab = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		height: '100% !custom',
		paddingLeft: '20',
		paddingRight: '12',
		typography: 'body.b2',
	})

	export const primary = style({ color: 'content.primary' })

	export const tertiary = style({ color: 'content.tertiary' })

	export const tab = style({
		alignItems: 'center',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'flex',
		flexShrink: '0 !custom',
		minHeight: '44px !custom',
		outlineOffset: '-2px !important',
		paddingInline: '12',
		typography: 'body.b2',
	})

	export const tabFirst = style({
		borderTopLeftRadius: 'xs !important',
		paddingLeft: '20',
	})

	export const tabActive = style({ color: 'content.primary' })

	export const tabLabel = style({
		alignItems: 'center',
		display: 'flex',
		height: '100% !custom',
		position: 'relative',
	})

	export const tabIndicator = style({
		backgroundColor: 'component.button.primary.fill',
		bottom: '0px !custom',
		height: '1px !custom',
		left: '0px !custom',
		marginInline: '-2px !custom',
		position: 'absolute',
		right: '0px !custom',
	})

	export const tabContextual = style({ paddingRight: '20' })

	export const hidden = style({ display: 'none' })
}
