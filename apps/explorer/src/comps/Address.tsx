import { Link } from '@tanstack/react-router'
import type { Address as AddressType } from 'ox'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { Midcut } from 'midcut'
import { cx } from '#lib/css'

export function Address(props: Address.Props) {
	const { address, align, chars = 3, className, search, self, title } = props
	const { isHighlighted, handlers } = useAddressHighlight(address)
	return (
		<>
			<Link
				to="/address/$address"
				params={{ address }}
				search={search}
				title={title}
				className={cx(
					'text-accent press-down hover:underline font-mono inline-flex min-w-0',
					align === 'end' && 'w-full justify-end',
					isHighlighted && 'underline',
					className,
				)}
				{...handlers}
			>
				<FindableMidcut align={align} min={chars} prefix="0x" value={address} />
			</Link>
			{self && <span className="text-tertiary"> (self)</span>}
		</>
	)
}

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

export namespace Address {
	export interface Props {
		address: AddressType.Address
		align?: Midcut.Props['align']
		chars?: number
		className?: string
		search?: Record<string, unknown>
		self?: boolean
		title?: string
	}
}
