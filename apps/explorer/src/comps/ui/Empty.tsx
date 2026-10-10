import { IconBadge, style, variants } from '@tempoxyz/ds/platform'
import type * as React from 'react'

/** Centered empty, blocked, or recoverable state in the TDS Platform style. */
export function Empty(props: Empty.Props): React.JSX.Element {
	const { action, children, compact, icon, title } = props

	return (
		<div {...styles.root({ compact })}>
			{icon && (
				<IconBadge aria-hidden appearance="gray" scale="medium">
					{icon}
				</IconBadge>
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
		/** Drop the minimum height and use tighter padding inside lists. */
		compact?: boolean | undefined
		/** Decorative icon above the title. */
		icon?: React.ReactElement | undefined
		/** Primary empty-state message. */
		title: React.ReactNode
	}
}

namespace styles {
	export const root = variants({
		base: {
			alignItems: 'center',
			display: 'flex',
			flexDirection: 'column',
			gap: '16',
			justifyContent: 'center',
			paddingInline: '24',
			textAlign: 'center',
		},
		defaultVariants: { compact: false },
		variants: {
			compact: {
				false: { minHeight: '180px !custom', paddingBlock: '48' },
				true: { paddingBlock: '32' },
			},
		},
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
