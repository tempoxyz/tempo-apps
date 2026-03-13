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
		currencyTotals,
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
							{currencyTotals !== undefined ? (
								<HoldingsDisplay totals={currencyTotals} />
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

function HoldingsDisplay(props: { totals: AccountCard.CurrencyTotal[] }) {
	const { totals } = props
	const positives = totals.filter((t) => t.value > 0)
	if (positives.length === 0)
		return <span className="text-tertiary text-[13px]">—</span>

	const fullDisplay = positives
		.map((t) => PriceFormatter.format(t.value, { currency: t.currency }))
		.join(' + ')

	const shortDisplay = positives
		.map((t) =>
			PriceFormatter.format(t.value, {
				currency: t.currency,
				format: 'short',
			}),
		)
		.join(' + ')

	return (
		<span className="text-[13px] text-primary" title={fullDisplay}>
			{shortDisplay}
		</span>
	)
}

export declare namespace AccountCard {
	type CurrencyTotal = { currency: string; value: number }

	type Props = {
		address?: Address.Address | undefined
		className?: string
		lastActivityTimestamp?: bigint | undefined
		createdTimestamp?: bigint | undefined
		currencyTotals?: CurrencyTotal[] | undefined
		accountType?: AccountType | undefined
		isToken?: boolean | undefined
		tokenName?: string | undefined
	}
}
