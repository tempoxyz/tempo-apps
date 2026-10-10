import { Button, IconButton, Tooltip } from '@tempoxyz/ds/platform'
import { Check, Copy } from '@tempoxyz/ds/platform/icons'
import type * as React from 'react'
import { useCopy } from '#lib/hooks'

/**
 * Copy action. Icon-only, it is a tertiary TDS `IconButton` with a tooltip;
 * with `children`, a tertiary TDS `Button` labelled by them. The toast from
 * `useCopy` announces the copy.
 */
export function CopyButton(props: CopyButton.Props): React.JSX.Element {
	const {
		ariaLabel = 'Copy to clipboard',
		children,
		className,
		disabled,
		value,
	} = props

	const { copy, notifying } = useCopy({ timeout: 2_000 })
	const onClick = () => copy(typeof value === 'function' ? value() : value)
	const icon = notifying ? <Check /> : <Copy />

	if (children)
		return (
			<Button
				className={className}
				disabled={disabled}
				onClick={onClick}
				scale="small"
				variant="tertiary"
			>
				{icon}
				{children}
			</Button>
		)

	return (
		<Tooltip content={ariaLabel}>
			<IconButton
				aria-label={ariaLabel}
				className={className}
				disabled={disabled}
				onClick={onClick}
				scale="small"
				variant="tertiary"
			>
				{icon}
			</IconButton>
		</Tooltip>
	)
}

export declare namespace CopyButton {
	type Props = {
		value: string | (() => string)
		/** Visible label. Without it the button is icon-only. */
		children?: React.ReactNode
		ariaLabel?: string | undefined
		disabled?: boolean | undefined
		className?: string | undefined
	}
}
