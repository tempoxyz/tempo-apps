import type { Address as AddressType } from 'ox'
import { isAddressEqual } from 'viem'

import { cx } from '#cva.config.ts'
import { HexFormatter } from '#lib/formatting.ts'
import type { KnownEvent } from '#lib/known-events.ts'
import { Address } from './Address.tsx'
import { Amount } from './Receipt/Amount.tsx'

export function EventDescription(props: EventDescription.Props) {
	const { event, seenAs, className } = props

	return (
		<div
			className={cx(
				'flex flex-row items-center gap-[6px] leading-[18px] flex-wrap',
				className,
			)}
		>
			{event.parts.map((part, index) => {
				const key = `${part.type}-${index}`
				switch (part.type) {
					case 'action':
						return (
							<span
								key={key}
								className="inline-flex items-center h-[24px] px-[5px] bg-base-background capitalize"
							>
								{part.value}
							</span>
						)
					case 'amount':
						return <Amount key={key} {...part.value} />
					case 'token':
						return (
							<span key={key} className="text-base-content-positive items-end">
								{part.value.symbol ||
									HexFormatter.shortenHex(part.value.address)}
							</span>
						)
					case 'account':
						return (
							<Address
								key={key}
								address={part.value}
								className="text-accent items-end press-down whitespace-nowrap"
								self={seenAs ? isAddressEqual(part.value, seenAs) : false}
							/>
						)
					case 'hex':
						return (
							<span
								key={key}
								className="items-end whitespace-nowrap"
								title={part.value}
							>
								{HexFormatter.shortenHex(part.value)}
							</span>
						)
					case 'primary':
						return (
							<span key={key} className="items-end">
								{part.value}
							</span>
						)
					case 'secondary':
						return (
							<span key={key} className="items-end text-secondary">
								{part.value}
							</span>
						)
					case 'tick':
						return (
							<span key={key} className="items-end">
								{part.value}
							</span>
						)
					default:
						return null
				}
			})}
		</div>
	)
}

export namespace EventDescription {
	export interface Props {
		event: KnownEvent
		seenAs?: AddressType.Address
		className?: string | undefined
	}
}
