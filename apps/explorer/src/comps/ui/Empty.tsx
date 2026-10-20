import { Empty as TdsEmpty, style } from '@tempoxyz/ds'
import type * as React from 'react'

/** Centered empty, blocked, or recoverable state, built on TDS `Empty`. */
export function Empty(props: Empty.Props): React.JSX.Element {
	const { action, children, compact, icon, title } = props

	return (
		<TdsEmpty.Root {...(compact ? {} : styles.root())}>
			{icon && <TdsEmpty.Icon>{icon}</TdsEmpty.Icon>}
			<TdsEmpty.Title>{title}</TdsEmpty.Title>
			{children && <TdsEmpty.Description>{children}</TdsEmpty.Description>}
			{action && <TdsEmpty.Actions>{action}</TdsEmpty.Actions>}
		</TdsEmpty.Root>
	)
}

export declare namespace Empty {
	type Props = {
		/** Action rendered below the message. */
		action?: React.ReactNode | undefined
		/** Supporting copy. */
		children?: React.ReactNode | undefined
		/** Drop the minimum height inside lists. */
		compact?: boolean | undefined
		/** Decorative icon above the title. */
		icon?: React.ReactElement | undefined
		/** Primary empty-state message, rendered as an `h3`. */
		title: React.ReactNode
	}
}

namespace styles {
	// TDS `Empty.Root` sets no height or main-axis alignment.
	export const root = style({
		justifyContent: 'center',
		minHeight: '180px !custom',
	})
}
