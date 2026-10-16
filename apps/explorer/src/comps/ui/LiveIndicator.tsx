import { StatusIndicator, style, variants } from '@tempoxyz/ds/platform'
import type * as React from 'react'
import { cx } from 'zyzz'
import { animatePing } from '#styles/explorer'

/**
 * TDS StatusIndicator with an optional ping ring over its dot, for live feeds
 * and network status.
 */
export function LiveIndicator(props: LiveIndicator.Props): React.JSX.Element {
	const {
		children,
		className,
		pinging = false,
		tone = 'positive',
		...rest
	} = props

	return (
		<span {...styles.root({ className })}>
			{pinging && (
				<span
					aria-hidden="true"
					{...cx(styles.ring({ tone }), animatePing())}
				/>
			)}
			<StatusIndicator {...rest} tone={tone}>
				{children}
			</StatusIndicator>
		</span>
	)
}

export declare namespace LiveIndicator {
	type Props = Omit<StatusIndicator.Props, 'className' | 'tone'> & {
		className?: string | undefined
		/** Animate a ring around the dot while the feed is live. */
		pinging?: boolean | undefined
		tone?: StatusIndicator.Props['tone']
	}
}

namespace styles {
	export const root = style({
		display: 'inline-flex',
		position: 'relative',
	})

	// Sits over StatusIndicator's 8px leading dot.
	export const ring = variants({
		base: {
			borderRadius: 'full',
			height: '8',
			left: '0px !custom',
			opacity: 0.75,
			pointerEvents: 'none',
			position: 'absolute',
			top: '50% !custom',
			translate: '0 -50% !custom',
			width: '8',
		},
		defaultVariants: { tone: 'positive' },
		variants: {
			tone: {
				negative: { backgroundColor: 'content.negative' },
				neutral: { backgroundColor: 'content.secondary' },
				positive: { backgroundColor: 'content.positive' },
				warning: { backgroundColor: 'content.warning' },
			},
		},
	})
}
