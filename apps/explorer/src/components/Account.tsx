import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import type { Address } from 'ox'
import { InfoCard } from '#components/InfoCard'
import { RelativeTime } from '#components/RelativeTime'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

const Route = getRouteApi('/_layout/account/$address')

export function AccountCard(props: AccountCard.Props) {
	const params = Route.useParams()
	const {
		address = params.address,
		className,
		createdTimestamp,
		lastActivityTimestamp,
		totalValue,
	} = props

	const { copy, notifying } = useCopy()

	return (
		<InfoCard
			title="Account"
			className={className}
			sections={[
				<button
					key="address"
					type="button"
					onClick={() => copy(address)}
					className="w-full text-left cursor-pointer press-down text-tertiary"
					title={address}
				>
					<div className="flex items-center gap-[8px] mb-[8px]">
						<span className="text-[13px] font-normal capitalize">Address</span>
						<div className="relative flex items-center">
							<CopyIcon className="w-[12px] h-[12px]" />
							{notifying && (
								<span className="absolute left-[calc(100%+8px)] text-[13px] leading-[16px]">
									copied
								</span>
							)}
						</div>
					</div>
					<p className="text-[14px] font-normal leading-[17px] tracking-[0.02em] text-primary break-all max-w-[22ch]">
						{address}
					</p>
				</button>,
				{
					label: 'Active',
					value: (
						<ClientOnly
							fallback={<span className="text-tertiary text-[13px]">…</span>}
						>
							{lastActivityTimestamp ? (
								<RelativeTime
									timestamp={lastActivityTimestamp}
									className="text-[13px] text-primary"
								/>
							) : (
								<span className="text-tertiary text-[13px]">…</span>
							)}
						</ClientOnly>
					),
				},
				{
					label: 'Holdings',
					value: (
						<ClientOnly
							fallback={<span className="text-tertiary text-[13px]">…</span>}
						>
							{totalValue !== undefined ? (
								<span className="text-[13px] text-primary">
									${totalValue.toFixed(2)}
								</span>
							) : (
								<span className="text-tertiary text-[13px]">…</span>
							)}
						</ClientOnly>
					),
				},
				{
					label: 'Created',
					value: (
						<ClientOnly
							fallback={<span className="text-tertiary text-[13px]">…</span>}
						>
							{createdTimestamp ? (
								<RelativeTime
									timestamp={createdTimestamp}
									className="text-[13px] text-primary"
								/>
							) : (
								<span className="text-tertiary text-[13px]">…</span>
							)}
						</ClientOnly>
					),
				},
			]}
		/>
	)
}

export declare namespace AccountCard {
	type Props = {
		address?: Address.Address | undefined
		className?: string
		lastActivityTimestamp?: bigint | undefined
		createdTimestamp?: bigint | undefined
		totalValue?: number | undefined
	}
}
