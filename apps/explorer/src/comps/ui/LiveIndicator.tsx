import { style, variants } from '@tempoxyz/ds'
import type * as React from 'react'
import { cx } from 'zyzz'
import { animatePing } from '#styles/explorer'

/**
 * A colored dot before gray label text, with an optional ping ring for live
 * feeds and network status. TDS Web has no status indicator; `Tag` with
 * `Tag.Dot` colors the text too.
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
		<span {...rest} {...styles.root({ className })}>
			<span aria-hidden="true" {...styles.dot()}>
				{pinging && <span {...cx(styles.fill({ tone }), animatePing())} />}
				<span {...styles.fill({ tone })} />
			</span>
			{children}
		</span>
	)
}

export declare namespace LiveIndicator {
	type Tone = 'negative' | 'neutral' | 'positive' | 'warning'

	type Props = Omit<React.ComponentPropsWithoutRef<'span'>, 'className'> & {
		className?: string | undefined
		/** Animate a ring around the dot while the feed is live. */
		pinging?: boolean | undefined
		tone?: Tone | undefined
	}
}

namespace styles {
	export const root = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'inline-flex',
		gap: '8',
		minHeight: '24',
		typography: 'label.12',
		whiteSpace: 'nowrap',
	})

	export const dot = style({
		flexShrink: 0,
		height: '8',
		position: 'relative',
		width: '8',
	})

	export const fill = variants({
		base: {
			borderRadius: 'full',
			inset: '0',
			position: 'absolute',
		},
		defaultVariants: { tone: 'positive' },
		variants: {
			tone: {
				negative: { backgroundColor: 'red.800' },
				neutral: { backgroundColor: 'gray.700' },
				positive: { backgroundColor: 'green.700' },
				warning: { backgroundColor: 'amber.700' },
			},
		},
	})
}
