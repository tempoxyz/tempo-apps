import { Midcut } from 'midcut'
import { cx } from '#lib/css'

export function FindableMidcut(props: Midcut.Props) {
	const { align, value = '' } = props

	return (
		<span className="relative inline-flex min-w-0 w-full">
			<span aria-hidden="true" className="inline-flex min-w-0 w-full">
				<Midcut {...props} />
			</span>
			<span
				className={cx(
					'absolute inset-0 overflow-hidden whitespace-nowrap text-transparent pointer-events-none',
					align === 'end' && 'text-right',
				)}
			>
				{value}
			</span>
		</span>
	)
}
