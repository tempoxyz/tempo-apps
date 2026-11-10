import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import { Amount, Hex, style, TokenLogo } from '@tempoxyz/ds'
import type { Address } from 'ox'
import type * as React from 'react'
import { InfoCard } from '#comps/InfoCard'
import { RelativeTime } from '#comps/RelativeTime'
import type { AccountType } from '#lib/account'
import { resolveLogoURI } from '#lib/domain/tip20'

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

	const titleLabel = virtualAddressParts
		? 'Virtual address'
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
								<TokenLogo
									address={address}
									size="large"
									src={resolveLogoURI(tokenLogoURI)}
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
				{
					label: 'Address',
					value: (
						<Hex.Root value={address}>
							<Hex.Text />
							<Hex.Copy aria-label="Copy address" />
						</Hex.Root>
					),
				},
				...(virtualAddressParts
					? [
							{
								label: 'Master ID',
								value: <Hex value={virtualAddressParts.masterId} />,
							},
							{
								label: <span {...styles.normalCase()}>User tag</span>,
								value: <Hex value={virtualAddressParts.userTag} />,
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
												<Amount currency="USD" value={totalValue} />
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
		gap: '12',
		minWidth: '0 !custom',
		paddingBlock: '12',
		width: '100% !custom',
	})

	export const tokenText = style({ flex: 1, minWidth: '0 !custom' })

	export const tokenName = style({
		color: 'content.primary',
		display: 'block',
		overflowWrap: 'anywhere',
	})

	export const tokenSymbol = style({
		color: 'content.secondary',
		display: 'block',
		marginTop: '2px !custom',
		overflowWrap: 'anywhere',
		typography: 'body.b3',
	})

	export const normalCase = style({ textTransform: 'none' })

	export const primary = style({ color: 'content.primary' })

	export const secondary = style({ color: 'content.secondary' })
}
