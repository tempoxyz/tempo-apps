import { style, Surface, Tabs } from '@tempoxyz/ds'
import * as React from 'react'
import { cx } from 'zyzz'
import { noScrollbar } from '#styles/explorer'

/**
 * A card for a page's related views: one section under its title, or several
 * as tabs. `mode` tells the content (such as `DataGrid`) which layout to use.
 */
export function Sections(props: Sections.Props): React.JSX.Element {
	const {
		sections: sections_,
		activeSection = 0,
		onSectionChange,
		mode = Sections.defaultMode,
	} = props

	const sections = sections_.filter((section) => section.visible !== false)
	const titleId = React.useId()

	if (sections.length === 1) {
		const [section] = sections
		return (
			<Sections.Context.Provider value={{ mode }}>
				<Surface
					aria-labelledby={titleId}
					render={<section />}
					size="medium"
					{...styles.root()}
				>
					<Surface.Header {...styles.header()}>
						<Surface.Title id={titleId}>{section.title}</Surface.Title>
						{section.contextual}
					</Surface.Header>
					{section.content}
				</Surface>
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
				{...styles.root()}
			>
				<Surface size="medium">
					<Surface.Header {...styles.header()}>
						<Tabs.List
							activateOnFocus
							aria-label="Details"
							expand={mode === 'stacked'}
							size="small"
							{...cx(noScrollbar(), mode === 'stacked' && styles.fill())}
						>
							{sections.map((section, index) => (
								<Tabs.Tab key={section.title} value={String(index)}>
									{section.title}
								</Tabs.Tab>
							))}
							<Tabs.Indicator />
						</Tabs.List>
						{/* Every section's controls stay mounted, so their state survives a tab switch. */}
						{sections.map(
							(section, index) =>
								section.contextual && (
									<div key={section.title} hidden={index !== activeSection}>
										{section.contextual}
									</div>
								),
						)}
					</Surface.Header>
					{sections.map((section, index) => (
						// The stacked layout mounts only the open panel, so hidden
						// sections don't load their data on small screens.
						<Tabs.Panel
							key={section.title}
							keepMounted={mode === 'tabs'}
							value={String(index)}
						>
							{section.content}
						</Tabs.Panel>
					))}
				</Surface>
			</Tabs.Root>
		</Sections.Context.Provider>
	)
}

export namespace Sections {
	export interface Props {
		activeSection?: number
		mode?: Mode
		/** Controls the selected section. */
		onSectionChange?: (index: number) => void
		sections: Section[]
	}

	/** `stacked` is the narrow-screen layout: full-width tabs and stacked grid columns. */
	export type Mode = 'tabs' | 'stacked'

	export interface Section {
		content: React.ReactNode
		contextual?: React.ReactNode
		title: string
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
	// Keeps its content height beside a taller card, and shrinks in a grid
	// track so wide content scrolls inside it.
	export const root = style({
		alignSelf: 'flex-start',
		minWidth: '0',
		width: '100% !custom',
	})

	export const header = style({ flexWrap: 'wrap', rowGap: '8' })

	// An expanded list takes its own line, so its tabs stretch across the card.
	export const fill = style({ flexBasis: '100% !custom' })
}
