import type * as React from 'react'
import { cx } from '#cva.config.ts'
import { useCopy } from '#lib/hooks.ts'
import CheckIcon from '~icons/lucide/check'
import CopyIcon from '~icons/lucide/copy'

export function CopyButton(props: CopyButton.Props): React.JSX.Element {
	const { value, ariaLabel, disabled, className } = props

	const { copy, notifying } = useCopy({ timeout: 2_000 })

	return (
		<button
			type="button"
			className={cx(
				'transition-colors press-down',
				notifying ? 'text-positive' : 'text-tertiary hover:text-primary',
				className,
			)}
			disabled={disabled}
			onClick={() => copy(value)}
			aria-label={ariaLabel ?? 'Copy to clipboard'}
			title={notifying ? 'Copied!' : (ariaLabel ?? 'Copy to clipboard')}
		>
			{notifying ? (
				<CheckIcon className="size-3.75" />
			) : (
				<CopyIcon className="size-3.75" />
			)}
		</button>
	)
}

export declare namespace CopyButton {
	type Props = {
		value: string
		ariaLabel?: string | undefined
		disabled?: boolean | undefined
		className?: string | undefined
	}
}
