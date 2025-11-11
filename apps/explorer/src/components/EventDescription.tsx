import { Link } from '@tanstack/react-router'
import { HexFormatter } from '#lib/formatting'
import type { KnownEvent } from '#lib/known-events'
import { Amount } from './Receipt/Amount'

export function EventDescription({ event }: { event: KnownEvent }) {
	return (
		<div className="flex flex-row flex-wrap items-center gap-[6px] leading-[18px]">
			{event.parts.map((part, partIndex) => {
				const partKey = `${part.type}-${partIndex}`
				switch (part.type) {
					case 'action':
						return (
							<span
								key={partKey}
								className="inline-flex items-center h-[24px] px-[5px] bg-base-alt capitalize"
							>
								{part.value}
							</span>
						)
					case 'amount':
						return (
							<Amount
								key={partKey}
								value={part.value.value}
								token={part.value.token}
								decimals={part.value.decimals}
							/>
						)
					case 'token':
						return (
							<span
								key={partKey}
								className="text-base-content-positive items-end"
							>
								{part.value.symbol ||
									HexFormatter.shortenHex(part.value.address)}
							</span>
						)
					case 'account':
						return (
							<Link
								key={partKey}
								to={'/account/$address'}
								params={{ address: part.value }}
								className="text-accent items-end active:translate-y-[0.5px] whitespace-nowrap"
								title={part.value}
							>
								{HexFormatter.shortenHex(part.value)}
							</Link>
						)
					case 'hex':
						return (
							<span
								key={partKey}
								className="items-end whitespace-nowrap"
								title={part.value}
							>
								{HexFormatter.shortenHex(part.value)}
							</span>
						)
					case 'primary':
						return (
							<span key={partKey} className="items-end">
								{part.value}
							</span>
						)
					case 'secondary':
						return (
							<span key={partKey} className="items-end text-secondary">
								{part.value}
							</span>
						)
					case 'tick':
						return (
							<span key={partKey} className="items-end">
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
