import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds'
import { Check, Copy } from '@tempoxyz/ds/icons'
import type { Address } from 'ox'
import { cx } from 'zyzz'
import { InfoCard } from '#comps/InfoCard'
import { RelativeTime } from '#comps/RelativeTime'
import { TokenIcon } from '#comps/TokenIcon'
import type { AccountType } from '#lib/account'
import { PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import { mono, pressDown } from '#styles/explorer'

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
						className={isToken ? styles.tokenTitle().className : undefined}
					>
						{isToken ? (
							<>
								<TokenIcon
									address={address as Address.Address}
									logoURI={tokenLogoURI}
									size={32}
								/>
								<span {...styles.tokenText()}>
									<span {...styles.tokenName()}>{tokenLabel}</span>
									{tokenSymbol && tokenSymbol !== tokenLabel && (
										<span {...styles.tokenSymbol()}>{tokenSymbol}</span>
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
					{...cx(styles.copyAddress(), pressDown())}
					title={address}
					aria-label="Copy address"
				>
					<span {...styles.copyHeader()}>
						Address
						{notifying ? <Check /> : <Copy />}
					</span>
					<span {...styles.addressValue()}>{address}</span>
				</button>,
				...(virtualAddressParts
					? [
							{
								label: 'Master ID',
								value: (
									<span {...cx(styles.primary(), mono())}>
										{virtualAddressParts.masterId}
									</span>
								),
							},
							{
								label: 'User Tag',
								value: (
									<span {...cx(styles.primary(), mono())}>
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
								value: <span {...styles.secondary()}>Forwarded</span>,
							},
						]
					: !hideHoldings
						? [
								{
									label: 'Holdings',
									value: (
										<ClientOnly
											fallback={<span {...styles.secondary()}>…</span>}
										>
											{totalValue !== undefined ? (
												<span
													{...styles.primary()}
													title={PriceFormatter.format(totalValue)}
												>
													{PriceFormatter.format(totalValue, {
														format: 'short',
													})}
												</span>
											) : (
												<span {...styles.secondary()}>…</span>
											)}
										</ClientOnly>
									),
								},
							]
						: []),
				{
					label: 'Active',
					value: (
						<ClientOnly fallback={<span {...styles.secondary()}>…</span>}>
							{lastActivityTimestamp ? (
								<RelativeTime
									timestamp={lastActivityTimestamp}
									className={styles.primary().className}
								/>
							) : (
								<span {...styles.secondary()} title="Last activity unavailable">
									—
								</span>
							)}
						</ClientOnly>
					),
				},
				{
					label: 'Created',
					value: (
						<ClientOnly fallback={<span {...styles.secondary()}>…</span>}>
							{createdTimestamp ? (
								<RelativeTime
									timestamp={createdTimestamp}
									className={styles.primary().className}
								/>
							) : (
								<span {...styles.secondary()} title="Creation time unavailable">
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

namespace styles {
	export const tokenTitle = style({
		gap: '3',
		minWidth: '0 !custom',
		paddingBlock: '3',
		width: '100% !custom',
	})

	export const tokenText = style({ flex: 1, minWidth: '0 !custom' })

	export const tokenName = style({
		color: 'foreground',
		display: 'block',
		overflowWrap: 'anywhere',
	})

	export const tokenSymbol = style({
		color: 'gray.900',
		display: 'block',
		marginTop: '2px !custom',
		overflowWrap: 'anywhere',
		typography: 'label.12',
	})

	export const copyAddress = style({
		color: 'gray.900',
		cursor: 'pointer',
		textAlign: 'left',
		width: '100% !custom',
	})

	export const copyHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
		marginBottom: '2',
		selectors: { '& > svg': { height: '3', width: '3' } },
	})

	export const addressValue = style({
		color: 'foreground',
		display: 'block',
		maxWidth: '32ch !custom',
		typography: 'label.12.mono',
		wordBreak: 'break-all',
	})

	export const primary = style({ color: 'foreground' })

	export const secondary = style({ color: 'gray.900' })
}
