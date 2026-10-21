import { style } from '@tempoxyz/ds'
import type { ReactNode } from 'react'
import { cx } from 'zyzz'

export function InfoCard(props: InfoCard.Props) {
	const { title, sections, className } = props

	const hasTitle = typeof title !== 'undefined' && title !== null

	const sectionsContent = sections.map((section, index) => {
		const isSectionEntry =
			section && typeof section === 'object' && 'label' in section
		const isLast = index === sections.length - 1
		const key = `section-${index}`

		return (
			<div
				key={key}
				{...cx(styles.section(), !isLast && styles.sectionDivider())}
			>
				{isSectionEntry ? (
					<div {...styles.entry()}>
						<span {...styles.label()}>{section.label}</span>
						<div {...styles.value()}>{section.value}</div>
					</div>
				) : (
					section
				)}
			</div>
		)
	})

	return (
		<section {...styles.root({ className })}>
			{hasTitle && <div {...styles.header()}>{title}</div>}
			{hasTitle ? (
				<div {...styles.body()}>{sectionsContent}</div>
			) : (
				sectionsContent
			)}
		</section>
	)
}

InfoCard.Title = function InfoCardTitle(props: {
	children: ReactNode
	className?: string
}) {
	return (
		<h1 {...styles.title({ className: props.className })}>{props.children}</h1>
	)
}

export declare namespace InfoCard {
	export type Props = {
		sections: Array<ReactNode | { label: ReactNode; value: ReactNode }>
		title?: ReactNode
		className?: string
	}
}

namespace styles {
	// An unpadded bordered surface: TDS `Surface` always pads. Width sits in
	// `:where()` so the caller's `className` decides it.
	export const root = style({
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: '12',
		borderStyle: 'solid',
		borderWidth: '1px',
		overflow: 'hidden',
		typography: 'copy.14',
		selectors: { ':where(&)': { width: '100% !custom' } },
		'@media (width >= 1240px)': {
			selectors: { ':where(&)': { width: 'fit-content !custom' } },
		},
	})

	export const header = style({
		alignItems: 'center',
		backgroundColor: 'background.surface',
		color: 'foreground',
		display: 'flex',
		minHeight: '44',
		paddingInline: '16',
	})

	export const body = style({
		backgroundColor: 'background.surface',
		borderTopColor: 'grayAlpha.200',
		borderTopLeftRadius: '12',
		borderTopRightRadius: '12',
		borderTopStyle: 'solid',
		borderTopWidth: '1px',
		marginBottom: '-1px !custom',
		marginInline: '-1px !custom',
	})

	export const section = style({
		alignItems: 'center',
		display: 'flex',
		paddingBlock: '12',
		paddingInline: '20',
		typography: 'copy.14',
	})

	export const sectionDivider = style({
		borderBottomColor: 'grayAlpha.200',
		borderBottomStyle: 'solid',
		borderBottomWidth: '1px',
	})

	export const entry = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const label = style({
		color: 'gray.900',
		flexShrink: '0 !custom',
		textTransform: 'capitalize',
	})

	export const value = style({
		color: 'foreground',
		display: 'flex',
		flex: 1,
		fontVariantNumeric: 'tabular-nums',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
		typography: 'copy.14',
	})

	// Gap sits in `:where()` so the caller's `className` can widen it.
	export const title = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		typography: 'copy.18.strong',
		userSelect: 'none',
		selectors: { ':where(&)': { gap: '8' } },
	})
}
