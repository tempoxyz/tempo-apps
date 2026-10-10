import { style } from '@tempoxyz/ds/platform'
import type * as React from 'react'
import { cx } from 'zyzz'
import { useCopy } from '#lib/hooks.ts'
import { pressDown, transitionColors } from '#styles/explorer'
import CheckIcon from '~icons/lucide/check'
import CopyIcon from '~icons/lucide/copy'

/**
 * Inline copy action in the style of a tertiary TDS `IconButton`. It stays a
 * native button because it can carry a text label beside the icon and callers
 * resize it through `className`, which `IconButton` does not support.
 */
export function CopyButton(props: CopyButton.Props): React.JSX.Element {
	const { value, ariaLabel, disabled, className, children } = props

	const { copy, notifying } = useCopy({ timeout: 2_000 })

	return (
		<button
			type="button"
			{...cx(
				styles.button({ className }),
				transitionColors(),
				pressDown(),
				Boolean(children) && styles.labelled(),
				notifying && styles.notifying(),
			)}
			disabled={disabled}
			onClick={() => copy(typeof value === 'function' ? value() : value)}
			aria-label={ariaLabel ?? 'Copy to clipboard'}
			title={notifying ? 'Copied!' : (ariaLabel ?? 'Copy to clipboard')}
		>
			{notifying ? (
				<CheckIcon {...styles.icon()} />
			) : (
				<CopyIcon {...styles.icon()} />
			)}
			{children}
		</button>
	)
}

export declare namespace CopyButton {
	type Props = {
		value: string | (() => string)
		children?: React.ReactNode
		ariaLabel?: string | undefined
		disabled?: boolean | undefined
		className?: string | undefined
	}
}

namespace styles {
	// Size, padding, and radius sit in `:where()` so a caller's `className`
	// can reshape the button.
	export const button = style({
		alignItems: 'center',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'inline-flex',
		flexShrink: '0 !custom',
		gap: '8',
		justifyContent: 'center',
		whiteSpace: 'nowrap',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'container.regular',
				color: 'content.primary',
			},
		},
		selectors: {
			':where(&)': {
				borderRadius: 'full',
				height: '24',
				paddingInline: 'none',
				width: '24',
			},
			'&:disabled': { cursor: 'default' },
		},
	})

	export const labelled = style({
		selectors: { ':where(&)': { paddingInline: '8', width: 'auto !custom' } },
	})

	export const notifying = style({
		color: 'content.positive',
		'@media (hover: hover)': { ':hover': { color: 'content.positive' } },
	})

	export const icon = style({
		flexShrink: '0 !custom',
		height: '12',
		width: '12',
	})
}
