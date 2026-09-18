import type * as React from 'react'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks.ts'
import CheckIcon from '~icons/lucide/check'
import CopyIcon from '~icons/lucide/copy'

export function CopyButton(props: CopyButton.Props): React.JSX.Element {
	const { value, ariaLabel, disabled, className, children } = props

	const { copy, notifying } = useCopy({ timeout: 2_000 })

	return (
		<button
			type="button"
			className={cx(
				'inline-flex items-center gap-1.5 transition-colors press-down',
				notifying ? 'text-positive' : 'text-tertiary hover:text-primary',
				className,
			)}
			disabled={disabled}
			onClick={() => copy(typeof value === 'function' ? value() : value)}
			aria-label={ariaLabel ?? 'Copy to clipboard'}
			title={notifying ? 'Copied!' : (ariaLabel ?? 'Copy to clipboard')}
		>
			{notifying ? (
				<CheckIcon className="size-3.75" />
			) : (
				<CopyIcon className="size-3.75" />
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
