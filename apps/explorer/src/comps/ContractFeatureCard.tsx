import { style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
import { pressDown } from '#styles/explorer'
import ChevronDownIcon from '~icons/lucide/chevron-down'

export function ContractFeatureCard(props: {
	title: string
	rightSideTitle?: string
	actions?: React.ReactNode
	children: React.ReactNode
	description?: React.ReactNode
	rightSideDescription?: string
	textGrid?: Array<{ left?: React.ReactNode; right?: React.ReactNode }>
	collapsible?: boolean
	defaultCollapsed?: boolean
	docsUrl?: string
}) {
	const {
		title,
		description,
		actions,
		children,
		rightSideDescription,
		rightSideTitle,
		textGrid,
		collapsible,
		defaultCollapsed,
	} = props

	const [isCollapsed, setIsCollapsed] = React.useState(
		defaultCollapsed ?? false,
	)

	if (collapsible) {
		return (
			<section {...styles.collapsibleCard()}>
				<div {...styles.collapsibleHeader()}>
					<button
						type="button"
						onClick={() => setIsCollapsed(!isCollapsed)}
						{...cx(
							styles.toggle(),
							Boolean(actions) && styles.toggleWithActions(),
							pressDown(),
						)}
					>
						<span {...styles.collapsibleTitle()}>{title}</span>
						<ChevronDownIcon
							{...cx(
								styles.chevron(),
								isCollapsed && styles.chevronCollapsed(),
							)}
						/>
					</button>
					{actions && <div {...styles.collapsibleActions()}>{actions}</div>}
				</div>

				<div {...cx(styles.collapsibleBody(), isCollapsed && styles.hidden())}>
					{children}
				</div>
			</section>
		)
	}

	return (
		<section {...styles.card()}>
			<div {...styles.header()}>
				<div {...styles.headerContent()}>
					<div {...styles.headerRow()}>
						<a
							id={title.toLowerCase().replaceAll(' ', '-')}
							href={`#${title.toLowerCase().replaceAll(' ', '-')}`}
							{...styles.title()}
						>
							{title}
						</a>

						<p {...styles.rightSideTitle()}>{rightSideTitle}</p>
					</div>
					<div {...styles.headerRow()}>
						{description && <p {...styles.description()}>{description}</p>}
						{rightSideDescription && (
							<p {...styles.description()}>{rightSideDescription}</p>
						)}
					</div>
					{textGrid && (
						<div {...styles.textGrid()}>
							{textGrid.map((item, index) => (
								<div key={index} {...styles.textGridItem()}>
									{item.left}
									{item.right}
								</div>
							))}
						</div>
					)}
				</div>
				{actions}
			</div>
			<div {...styles.body()}>{children}</div>
		</section>
	)
}

namespace styles {
	export const collapsibleCard = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderWidth: 'regular',
		boxShadow: 'none',
		display: 'flex',
		flexDirection: 'column',
		overflow: 'hidden',
		width: '100% !custom',
	})

	export const collapsibleHeader = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 0,
		minHeight: '36px !custom',
	})

	export const toggle = style({
		alignItems: 'center',
		cursor: 'pointer',
		display: 'flex',
		flex: 1,
		gap: '8',
		minWidth: '0px !custom',
		paddingBlock: '8',
		paddingLeft: '16',
		paddingRight: '16',
		textAlign: 'left',
		':focus-visible': { outlineOffset: '-2px !important' },
	})

	export const toggleWithActions = style({ paddingRight: '12' })

	export const collapsibleTitle = style({
		color: 'content.tertiary',
		minWidth: '0px !custom',
		overflowWrap: 'anywhere',
		typography: 'body.b3',
	})

	export const chevron = style({
		color: 'content.tertiary',
		flexShrink: 0,
		height: '14px !custom',
		width: '14px !custom',
	})

	export const chevronCollapsed = style({ rotate: '-90deg' })

	export const collapsibleActions = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		flexShrink: 0,
		gap: '8',
		paddingInline: '12',
	})

	export const collapsibleBody = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderTopLeftRadius: 'xs',
		borderTopRightRadius: 'xs',
		borderTopWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		minHeight: '0px !custom',
		overflowX: 'auto',
		paddingInline: '12',
		paddingTop: '12',
	})

	export const hidden = style({ display: 'none' })

	export const card = style({
		backgroundColor: 'background.secondary',
		borderRadius: 'xs',
		overflow: 'hidden',
	})

	export const header = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '12',
		paddingInline: '16',
		width: '100% !custom',
		'@media (width >= 640px)': {
			alignItems: 'center',
			flexDirection: 'row',
			justifyContent: 'space-between',
		},
	})

	export const headerContent = style({
		minWidth: '0px !custom',
		width: '100% !custom',
	})

	export const headerRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		width: '100% !custom',
	})

	export const title = style({
		color: 'content.primary',
		minWidth: '0px !custom',
		overflowWrap: 'anywhere',
		typography: 'body.b2',
	})

	export const rightSideTitle = style({
		color: 'content.primary',
		minWidth: '0px !custom',
		overflowWrap: 'anywhere',
		textAlign: 'right',
		typography: 'body.b3',
	})

	export const description = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const textGrid = style({
		columnGap: '16',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		marginTop: '4',
		rowGap: '4',
	})

	export const textGridItem = style({
		display: 'flex',
		gap: '8',
		typography: 'body.b3',
	})

	export const body = style({
		backgroundColor: 'background.secondary',
		padding: '8',
	})
}
