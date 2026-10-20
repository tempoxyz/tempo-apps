import { style, Tabs } from '@tempoxyz/ds'
import { ChevronDown } from '@tempoxyz/ds/icons'
import * as React from 'react'
import { cx } from 'zyzz'
import { noScrollbar, pressDown } from '#styles/explorer'
import { Pagination } from './Pagination'

export function Sections(props: Sections.Props): React.JSX.Element {
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
	const [collapsedSection, setCollapsedSection] = React.useState<string | null>(
		null,
	)

	const toggleSection = (title: string, index: number) => {
		if (onSectionChange) {
			// Controlled sections share the URL's tab and page with their data queries.
			setCollapsedSection(
				activeSection === index && collapsedSection !== title ? title : null,
			)
			if (activeSection !== index) onSectionChange(index)
			return
		}
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
					{sections.map((section, index) => {
						const itemsLabel = section.itemsLabel ?? 'items'
						const isCollapsed =
							section.autoCollapse !== false &&
							(onSectionChange
								? activeSection !== index || collapsedSection === section.title
								: !expandedSections.has(section.title))

						const canCollapse = section.autoCollapse !== false

						return (
							<section key={section.title} {...styles.section()}>
								{canCollapse ? (
									<h2>
										<button
											type="button"
											aria-expanded={!isCollapsed}
											onClick={() => toggleSection(section.title, index)}
											{...cx(
												styles.toggle(),
												pressDown(),
												!isCollapsed && styles.toggleExpanded(),
											)}
										>
											<span {...styles.title()}>{section.title}</span>
											<span {...styles.toggleMeta()}>
												{isCollapsed && Boolean(section.totalItems) && (
													<span {...styles.count()}>
														{section.totalItems}{' '}
														{Pagination.pluralize(
															section.totalItems ?? 0,
															itemsLabel,
														)}
													</span>
												)}
												<ChevronDown
													{...cx(
														styles.chevron(),
														!isCollapsed && styles.chevronExpanded(),
													)}
												/>
											</span>
										</button>
									</h2>
								) : (
									<div {...styles.header()}>
										<h2 {...styles.title()}>{section.title}</h2>
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

	if (sections.length === 1) {
		const [section] = sections
		return (
			<Sections.Context.Provider value={{ mode }}>
				<section {...cx(styles.section(), styles.sectionTabs())}>
					<div {...styles.tabsHeader()}>
						<h2 {...styles.singleTitle()}>
							{section.title}
							{Boolean(section.totalItems) && (
								<span {...styles.count()}>({section.totalItems})</span>
							)}
						</h2>
						{section.contextual}
					</div>
					<div {...styles.content()}>{section.content}</div>
				</section>
			</Sections.Context.Provider>
		)
	}

	return (
		<Sections.Context.Provider value={{ mode }}>
			<Tabs.Root
				value={String(activeSection)}
				onValueChange={(value) => {
					if (value === null || Number(value) === activeSection) return
					onSectionChange?.(Number(value))
				}}
				{...cx(styles.section(), styles.sectionTabs())}
			>
				<div {...styles.tabsHeader()}>
					<Tabs.List
						activateOnFocus
						aria-label="Details"
						size="small"
						{...cx(styles.tabList(), noScrollbar())}
					>
						{sections.map((section, index) => (
							<Tabs.Tab key={section.title} value={String(index)}>
								{section.title}
							</Tabs.Tab>
						))}
						<Tabs.Indicator />
					</Tabs.List>
					{sections.map((section, index) => (
						<div
							key={section.title}
							hidden={activeSection !== index}
							{...styles.contextualSlot()}
						>
							{section.contextual}
						</div>
					))}
				</div>

				{sections.map((section, index) => (
					<Tabs.Panel
						key={section.title}
						keepMounted
						value={String(index)}
						{...styles.content()}
					>
						{section.content}
					</Tabs.Panel>
				))}
			</Tabs.Root>
		</Sections.Context.Provider>
	)
}

export namespace Sections {
	export interface Props {
		defaultExpandedSection?: string
		activeSection?: number
		mode?: Mode
		/** Controls the selected section in both tabbed and stacked layouts. */
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
		gap: '4',
	})

	export const section = style({
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		overflow: 'hidden',
		width: '100% !custom',
	})

	export const sectionTabs = style({
		alignSelf: 'flex-start',
		minHeight: '0 !custom',
	})

	// Rounded like the card, so the inset focus ring follows its corners.
	export const toggle = style({
		alignItems: 'center',
		borderRadius: 'xl',
		cursor: 'pointer',
		display: 'flex',
		height: '52px !custom',
		justifyContent: 'space-between',
		outlineOffset: '-2px !custom',
		paddingInline: '5',
		width: '100% !custom',
	})

	export const toggleExpanded = style({
		borderBottomLeftRadius: '0px !custom',
		borderBottomRightRadius: '0px !custom',
	})

	export const title = style({
		color: 'foreground',
		typography: 'copy.18.strong',
	})

	export const toggleMeta = style({
		alignItems: 'center',
		display: 'flex',
		gap: '3',
	})

	export const count = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const chevron = style({
		color: 'gray.900',
		height: '4',
		width: '4',
	})

	export const chevronExpanded = style({ rotate: '180deg' })

	export const header = style({
		alignItems: 'center',
		display: 'flex',
		height: '52px !custom',
		justifyContent: 'space-between',
		paddingInline: '5',
	})

	// On `Tabs.Panel`, which sets a 12px top margin: the panel meets the header.
	export const content = style({
		backgroundColor: 'background.surface',
		borderTopColor: 'grayAlpha.200',
		borderTopStyle: 'solid',
		borderTopWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		marginBlockStart: '0',
		minHeight: '0 !custom',
		overflowX: 'auto',
		selectors: { '&[hidden]': { display: 'none' } },
	})

	export const contentStacked = style({
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		borderTopLeftRadius: 'xl',
		borderTopRightRadius: 'xl',
		borderWidth: '1px',
		marginBottom: '-1px !custom',
		marginInline: '-1px !custom',
	})

	export const contextual = style({
		borderBottomColor: 'grayAlpha.200',
		borderBottomStyle: 'solid',
		borderBottomWidth: '1px',
		paddingBlock: '3',
		paddingInline: '5',
	})

	export const tabsHeader = style({
		alignItems: 'center',
		columnGap: '3',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		minHeight: '12',
		paddingBlock: '2',
		paddingInline: '4',
		rowGap: '2',
	})

	export const tabList = style({ minWidth: '0 !custom' })

	export const singleTitle = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		gap: '2',
		typography: 'copy.14',
	})

	export const contextualSlot = style({
		selectors: { '&[hidden]': { display: 'none' } },
	})
}
