import { cx } from '#lib/css'

export function ExperimentalBadge(props: ExperimentalBadge.Props) {
	const { className } = props

	return (
		<div
			className={cx(
				'text-[11px] font-normal bg-base-alt text-base-content rounded-md px-[6px] py-[2px]',
				className,
			)}
		>
			Experimental
		</div>
	)
}

export declare namespace ExperimentalBadge {
	type Props = {
		className?: string
	}
}
