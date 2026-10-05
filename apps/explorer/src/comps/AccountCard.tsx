import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import type { Address } from 'ox'
import { InfoCard } from '#comps/InfoCard'
import { RelativeTime } from '#comps/RelativeTime'
import { TokenIcon } from '#comps/TokenIcon'
import type { AccountType } from '#lib/account'
import { cx } from '#lib/css'
import { PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

const Route = getRouteApi('/_layout/address/$address')

export function AccountCard(props: AccountCard.Props): React.JSX.Element {
	const params = Route.useParams()
	const {
		address = params.address,
		className,
		createdTimestamp,
		lastActivityTimestamp,
		totalValue,
		hideHoldings,
		accountType,
		isToken,
		tokenLogoURI,
		tokenName,
		tokenSymbol,
		virtualAddressParts,
	} = props

	const { copy, notifying } = useCopy()

	const titleLabel = virtualAddressParts
		? 'Virtual Address'
		: isToken
			? 'Token'
			: accountType === 'contract'
				? 'Contract'
				: 'Address'

	const titleVisible =
		isToken || virtualAddressParts || accountType === 'contract'
	const tokenLabel = tokenName || tokenSymbol || 'Token'

	return (
		<InfoCard
			title={
				titleVisible ? (
					<InfoCard.Title
						className={cx(isToken && 'min-w-0 w-full py-3 gap-3')}
					>
						{isToken ? (
							<>
								<TokenIcon
									address={address as Address.Address}
									name={tokenLabel}
									className="size-8"
									logoURI={tokenLogoURI}
								/>
								<span className="min-w-0 flex-1">
									<span className="block wrap-anywhere text-primary">
										{tokenLabel}
									</span>
									{tokenSymbol && tokenSymbol !== tokenLabel && (
										<span className="block wrap-anywhere label-12 text-tertiary font-normal mt-0.5">
											{tokenSymbol}
										</span>
									)}
								</span>
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
					aria-label={notifying ? 'Address copied' : 'Copy address'}
				>
					<div className="flex items-center gap-[8px] mb-[8px]">
						<span className="capitalize">Address</span>
						<div className="relative flex items-center">
							<CopyIcon className="w-[12px] h-[12px]" />
							{notifying && (
								<span className="absolute left-[calc(100%+8px)]">copied</span>
							)}
						</div>
					</div>
					<p className="font-mono copy-13 text-primary break-all leading-relaxed max-w-[32ch]">
						{address}
					</p>
				</button>,
				...(virtualAddressParts
					? [
							{
								label: 'Master ID',
								value: (
									<span className="text-primary">
										{virtualAddressParts.masterId}
									</span>
								),
							},
							{
								label: 'User Tag',
								value: (
									<span className="text-primary">
										{virtualAddressParts.userTag}
									</span>
								),
							},
						]
					: []),
				...(virtualAddressParts
					? [
							{
								label: 'Holdings',
								value: <span className="text-tertiary">Forwarded</span>,
							},
						]
					: !hideHoldings
						? [
								{
									label: 'Holdings',
									value: (
										<ClientOnly
											fallback={<span className="text-tertiary">…</span>}
										>
											{totalValue !== undefined ? (
												<span
													className="text-primary"
													title={PriceFormatter.format(totalValue)}
												>
													{PriceFormatter.format(totalValue, {
														format: 'short',
													})}
												</span>
											) : (
												<span className="text-tertiary">…</span>
											)}
										</ClientOnly>
									),
								},
							]
						: []),
				{
					label: 'Active',
					value: (
						<ClientOnly fallback={<span className="text-tertiary">…</span>}>
							{lastActivityTimestamp ? (
								<RelativeTime
									timestamp={lastActivityTimestamp}
									className="text-primary"
								/>
							) : (
								<span
									className="text-tertiary"
									title="Last activity unavailable"
								>
									—
								</span>
							)}
						</ClientOnly>
					),
				},
				{
					label: 'Created',
					value: (
						<ClientOnly fallback={<span className="text-tertiary">…</span>}>
							{createdTimestamp ? (
								<RelativeTime
									timestamp={createdTimestamp}
									className="text-primary"
								/>
							) : (
								<span
									className="text-tertiary"
									title="Creation time unavailable"
								>
									—
								</span>
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
		hideHoldings?: boolean | undefined
		accountType?: AccountType | undefined
		isToken?: boolean | undefined
		tokenLogoURI?: string | undefined
		tokenName?: string | undefined
		tokenSymbol?: string | undefined
		virtualAddressParts?:
			| {
					masterId: string
					userTag: string
			  }
			| undefined
	}
}
