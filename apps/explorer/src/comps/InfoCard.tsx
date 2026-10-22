import { Rows, style, Surface } from '@tempoxyz/ds'
import type * as React from 'react'

/**
 * A card of one record's fields, as in the TDS detail examples: a `Surface`
 * named by a `Surface.Header` with the title and, at its end, an `action`
 * such as a status `Tag`, above full-width `Rows`. `{ label, value }`
 * sections render as key-value rows, and any other node as a row of its own.
 * Buttons that act on the whole record go in the `footer`, below the rows, as
 * in the TDS receipt: the last row reaches the card's bottom edge, which
 * leaves a button there no margin.
 */
export function InfoCard(props: InfoCard.Props): React.JSX.Element {
	const { action, title, sections = [], footer, className } = props
	const isEmpty = (section: (typeof sections)[number]) =>
		section === null || section === undefined || section === false

	return (
		<Surface className={className} size="medium">
			{(title || action) && (
				<Surface.Header>
					{title}
					{action}
				</Surface.Header>
			)}
			{!sections.every(isEmpty) && (
				<Rows.Root dividers="full">
					{sections.map((section, index) => {
						if (isEmpty(section)) return null
						const key = `section-${index}`
						if (section && typeof section === 'object' && 'label' in section)
							return (
								<Rows.Row key={key}>
									<Rows.Label>{section.label}</Rows.Label>
									{section.value}
								</Rows.Row>
							)
						return <Rows.Row key={key}>{section}</Rows.Row>
					})}
				</Rows.Root>
			)}
			{footer && <div {...styles.footer()}>{footer}</div>}
		</Surface>
	)
}

export namespace InfoCard {
	export type Props = {
		/** Shown at the end of the header, such as a status `Tag` or a small text `Button`. */
		action?: React.ReactNode
		/** Buttons for the whole record, below the rows. */
		footer?: React.ReactNode
		sections?: Array<
			React.ReactNode | { label: React.ReactNode; value: React.ReactNode }
		>
		/** Usually an `InfoCard.Title`. */
		title?: React.ReactNode
		className?: string
	}

	/**
	 * The card's name and the page's heading: an `h1` set like
	 * `Surface.Title`, which only renders an `h2`.
	 */
	export function Title(props: Title.Props): React.JSX.Element {
		return (
			<h1 {...styles.title({ className: props.className })}>
				{props.children}
			</h1>
		)
	}

	export declare namespace Title {
		type Props = {
			children: React.ReactNode
			className?: string | undefined
		}
	}
}

namespace styles {
	export const footer = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		marginBlockStart: '16',
	})

	export const title = style({
		alignItems: 'center',
		color: 'foreground',
		columnGap: '12',
		display: 'flex',
		margin: '0',
		minWidth: '0',
		typography: 'heading.20',
	})
}
