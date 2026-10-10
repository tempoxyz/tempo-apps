import { style } from '@tempoxyz/ds/platform'
import type * as React from 'react'

/** Centered empty, blocked, or recoverable state in the TDS Platform style. */
export function Empty(props: Empty.Props): React.JSX.Element {
	const { action, children, className, icon, style: inlineStyle, title } = props

	return (
		<div {...styles.root({ className, style: inlineStyle })}>
			{icon && (
				<div aria-hidden {...styles.icon()}>
					{icon}
				</div>
			)}
			<div {...styles.copy()}>
				<p {...styles.title()}>{title}</p>
				{children && <p {...styles.description()}>{children}</p>}
			</div>
			{action && <div {...styles.actions()}>{action}</div>}
		</div>
	)
}

export declare namespace Empty {
	type Props = {
		/** Action rendered below the message. */
		action?: React.ReactNode | undefined
		/** Supporting copy. */
		children?: React.ReactNode | undefined
		className?: string | undefined
		/** Decorative icon above the title. */
		icon?: React.ReactNode | undefined
		style?: React.CSSProperties | undefined
		/** Primary empty-state message. */
		title: React.ReactNode
	}
}

namespace styles {
	export const root = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		justifyContent: 'center',
		minHeight: '180px !custom',
		paddingBlock: '48',
		paddingInline: '24',
		textAlign: 'center',
	})

	export const icon = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'xs',
		color: 'content.secondary',
		display: 'flex',
		height: '40',
		justifyContent: 'center',
		width: '40',
		selectors: { '& > svg': { height: '20', width: '20' } },
	})

	export const copy = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		maxWidth: '384px !custom',
	})

	export const title = style({
		color: 'content.primary',
		typography: 'body.b2Strong',
	})

	export const description = style({
		color: 'content.secondary',
		typography: 'body.b2',
	})

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		justifyContent: 'center',
	})
}
