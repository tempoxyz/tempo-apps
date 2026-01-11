import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import type { Address } from 'ox'
import { InfoCard } from '#comps/InfoCard'
import { RelativeTime } from '#comps/RelativeTime'
import { type AccountType, getAccountTag, isSystemAddress } from '#lib/account'
import { PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

const Route = getRouteApi('/_layout/address/$address')

export function AccountCard(props: AccountCard.Props) {
	const params = Route.useParams()
	const {
		address = params.address,
		className,
		createdTimestamp,
		lastActivityTimestamp,
		totalValue,
		accountType,
	} = props

	const { copy, notifying } = useCopy()
	const tag = getAccountTag(address as Address.Address)
	const isSystem = isSystemAddress(address as Address.Address)

	return (
		<InfoCard
			title={
				<div className="flex items-center justify-between px-[18px] h-[36px] font-sans">
					<h1 className="text-[13px] text-tertiary select-none">
						{accountType === 'contract' ? 'Contract' : 'Address'}
					</h1>
					{/* Only show chip when it provides additional info (system, empty) */}
					{(isSystem || accountType === 'empty') && (
						<div
							className="text-[11px] bg-base-alt rounded text-secondary lowercase select-none py-0.5 px-1.5 -mr-2.5 flex items-center"
							title={
								tag
									? tag.id.startsWith('system:')
										? `System: ${tag.label}`
										: tag.id.startsWith('genesis-token:')
											? `Genesis Token: ${tag.label}`
											: tag.label
									: accountType === 'empty'
										? 'Uninitialized account'
										: undefined
							}
						>
							<span>{isSystem ? 'system' : 'empty'}</span>
						</div>
					)}
				</div>
			}
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
					{/* 42 chars / 2 lines = 21ch */}
					<p className="text-[14px] font-normal leading-[17px] text-primary break-all max-w-[21ch] font-mono">
						{address}
					</p>
				</button>,
				{
					label: 'Holdings',
					value: (
						<ClientOnly
							fallback={<span className="text-tertiary text-[13px]">…</span>}
						>
							{totalValue !== undefined ? (
								<span
									className="text-[13px] text-primary"
									title={PriceFormatter.format(totalValue)}
								>
									{PriceFormatter.format(totalValue, { format: 'short' })}
								</span>
							) : (
								<span className="text-tertiary text-[13px]">…</span>
							)}
						</ClientOnly>
					),
				},
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
		accountType?: AccountType | undefined
	}
}
