import { style, Tab } from '@tempoxyz/ds/platform'
import { ChevronDown } from '@tempoxyz/ds/platform/icons'
import * as React from 'react'
import { cx } from 'zyzz'
import { pressDown } from '#styles/explorer'
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
									<h2>
										<button
											type="button"
											aria-expanded={!isCollapsed}
											onClick={() => toggleSection(section.title)}
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
			<Tab.Root
				value={String(activeSection)}
				onValueChange={(value) => {
					if (value === null || Number(value) === activeSection) return
					onSectionChange?.(Number(value))
				}}
				{...cx(styles.section(), styles.sectionTabs())}
			>
				<div {...styles.tabsHeader()}>
					<Tab.List activateOnFocus aria-label="Details" {...styles.tabList()}>
						{sections.map((section, index) => (
							<Tab key={section.title} scale="small" value={String(index)}>
								{section.title}
							</Tab>
						))}
					</Tab.List>
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
					<Tab.Panel
						key={section.title}
						keepMounted
						value={String(index)}
						{...styles.content()}
					>
						{section.content}
					</Tab.Panel>
				))}
			</Tab.Root>
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
		borderRadius: 'xs',
		cursor: 'pointer',
		display: 'flex',
		height: '52px !custom',
		justifyContent: 'space-between',
		outlineOffset: '-2px !custom',
		paddingInline: '20',
		width: '100% !custom',
	})

	export const toggleExpanded = style({
		borderBottomLeftRadius: 'none',
		borderBottomRightRadius: 'none',
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
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const chevron = style({
		color: 'content.secondary',
		height: '16',
		width: '16',
	})

	export const chevronExpanded = style({ rotate: '180deg' })

	export const header = style({
		alignItems: 'center',
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
		selectors: { '&[hidden]': { display: 'none' } },
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
		minHeight: '48',
		paddingBlock: '8',
		paddingInline: '16',
		rowGap: '8',
	})

	export const tabList = style({ minWidth: '0 !custom', rowGap: '4' })

	export const singleTitle = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '8',
		typography: 'body.b2',
	})

	export const contextualSlot = style({
		selectors: { '&[hidden]': { display: 'none' } },
	})
}
