import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import type { Address } from 'ox'
import { InfoCard } from '#comps/InfoCard'
import { RelativeTime } from '#comps/RelativeTime'
import { TokenIcon } from '#comps/TokenIcon'
import type { AccountType } from '#lib/account'
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
		isToken,
		tokenName,
	} = props

	const { copy, notifying } = useCopy()

	const titleLabel = isToken
		? 'Token'
		: accountType === 'contract'
			? 'Contract'
			: 'Address'

	const titleVisible = accountType === 'contract'

	return (
		<InfoCard
			title={
				titleVisible ? (
					<InfoCard.Title>
						{isToken && tokenName ? (
							<>
								<TokenIcon
									address={address as Address.Address}
									name={tokenName}
									className="size-4"
								/>
								<span className="text-primary">{tokenName}</span>
							</>
						) : (
							titleLabel
						)}
					</InfoCard.Title>
				) : undefined
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
		isToken?: boolean | undefined
		tokenName?: string | undefined
	}
}
