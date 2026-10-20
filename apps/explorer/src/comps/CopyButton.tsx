import { Button, Tooltip } from '@tempoxyz/ds'
import { Check, Copy } from '@tempoxyz/ds/icons'
import type * as React from 'react'
import { useCopy } from '#lib/hooks'

/**
 * Copy action. Icon-only, it is a TDS text icon `Button` with a tooltip; with
 * `children`, a small TDS text `Button` labelled by them. The toast from
 * `useCopy` announces the copy. Unlike TDS `CopyButton`, the value can be read
 * at click time (e.g. the current URL).
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
				size="small"
				variant="text"
			>
				{icon}
				{children}
			</Button>
		)

	return (
		<Tooltip.Root>
			<Tooltip.Trigger
				render={
					<Button
						aria-label={ariaLabel}
						className={className}
						disabled={disabled}
						onClick={onClick}
						shape="icon"
						size="small"
						variant="text"
					/>
				}
			>
				{icon}
			</Tooltip.Trigger>
			<Tooltip.Popup>{ariaLabel}</Tooltip.Popup>
		</Tooltip.Root>
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
