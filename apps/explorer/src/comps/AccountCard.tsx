import { ClientOnly, getRouteApi } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address } from 'ox'
import { cx } from 'zyzz'
import { InfoCard } from '#comps/InfoCard'
import { RelativeTime } from '#comps/RelativeTime'
import { TokenIcon } from '#comps/TokenIcon'
import type { AccountType } from '#lib/account'
import { PriceFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import { pressDown } from '#styles/explorer'
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
						className={isToken ? styles.tokenTitle().className : undefined}
					>
						{isToken ? (
							<>
								<TokenIcon
									address={address as Address.Address}
									name={tokenLabel}
									className={styles.tokenIcon().className}
									logoURI={tokenLogoURI}
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
					aria-label={notifying ? 'Address copied' : 'Copy address'}
				>
					<div {...styles.copyHeader()}>
						<span {...styles.capitalize()}>Address</span>
						<div {...styles.copyIconWrap()}>
							<CopyIcon {...styles.copyIcon()} />
							{notifying && <span {...styles.copied()}>copied</span>}
						</div>
					</div>
					<p {...styles.addressValue()}>{address}</p>
				</button>,
				...(virtualAddressParts
					? [
							{
								label: 'Master ID',
								value: (
									<span {...styles.mono()}>{virtualAddressParts.masterId}</span>
								),
							},
							{
								label: 'User Tag',
								value: (
									<span {...styles.mono()}>{virtualAddressParts.userTag}</span>
								),
							},
						]
					: []),
				...(virtualAddressParts
					? [
							{
								label: 'Holdings',
								value: <span {...styles.tertiary()}>Forwarded</span>,
							},
						]
					: !hideHoldings
						? [
								{
									label: 'Holdings',
									value: (
										<ClientOnly
											fallback={<span {...styles.tertiary()}>…</span>}
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
												<span {...styles.tertiary()}>…</span>
											)}
										</ClientOnly>
									),
								},
							]
						: []),
				{
					label: 'Active',
					value: (
						<ClientOnly fallback={<span {...styles.tertiary()}>…</span>}>
							{lastActivityTimestamp ? (
								<RelativeTime
									timestamp={lastActivityTimestamp}
									className={styles.primary().className}
								/>
							) : (
								<span {...styles.tertiary()} title="Last activity unavailable">
									—
								</span>
							)}
						</ClientOnly>
					),
				},
				{
					label: 'Created',
					value: (
						<ClientOnly fallback={<span {...styles.tertiary()}>…</span>}>
							{createdTimestamp ? (
								<RelativeTime
									timestamp={createdTimestamp}
									className={styles.primary().className}
								/>
							) : (
								<span {...styles.tertiary()} title="Creation time unavailable">
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

	export const tokenIcon = style({ height: '32', width: '32' })

	export const tokenText = style({ flex: 1, minWidth: '0 !custom' })

	export const tokenName = style({
		color: 'content.primary',
		display: 'block',
		overflowWrap: 'anywhere',
	})

	export const tokenSymbol = style({
		color: 'content.tertiary',
		display: 'block',
		marginTop: '2',
		overflowWrap: 'anywhere',
		typography: 'body.b3',
		fontWeight: 400,
	})

	export const copyAddress = style({
		color: 'content.tertiary',
		cursor: 'pointer',
		textAlign: 'left',
		width: '100% !custom',
	})

	export const copyHeader = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		marginBottom: '8',
	})

	export const capitalize = style({ textTransform: 'capitalize' })

	export const copyIconWrap = style({
		alignItems: 'center',
		display: 'flex',
		position: 'relative',
	})

	export const copyIcon = style({ height: '12', width: '12' })

	export const copied = style({
		left: 'calc(100% + 8px) !custom',
		position: 'absolute',
	})

	export const addressValue = style({
		color: 'content.primary',
		maxWidth: '32ch !custom',
		typography: 'mono.inline',
		lineHeight: '1.625 !custom',
		wordBreak: 'break-all',
	})

	export const mono = style({
		color: 'content.primary',
		fontFamily: '"JetBrains Mono", monospace',
		fontWeight: 400,
		letterSpacing: '0px',
	})

	export const primary = style({ color: 'content.primary' })

	export const tertiary = style({ color: 'content.tertiary' })
}
