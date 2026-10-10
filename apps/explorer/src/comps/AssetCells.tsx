import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type * as React from 'react'
import { formatUnits } from 'viem'
import { cx } from 'zyzz'
import { TokenIcon } from '#comps/TokenIcon'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { type AssetData, getAssetValue } from '#lib/address-balances'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { link, linkHover, pressDown, truncate } from '#styles/explorer'
import { getTempoChain } from '#wagmi.config'

export function AssetName(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.name) return <span {...styles.tertiary()}>…</span>
	return (
		<span {...styles.name()}>
			<TokenIcon
				address={asset.address}
				name={asset.metadata.name}
				className={styles.nameIcon().className}
			/>
			<span {...truncate()}>{asset.metadata.name}</span>
		</span>
	)
}

export function AssetSymbol(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.symbol) return <span {...styles.tertiary()}>…</span>
	return (
		<Link
			to="/token/$address"
			params={{ address: asset.address }}
			{...cx(link(), linkHover(), pressDown(), truncate())}
		>
			{asset.metadata.symbol}
		</Link>
	)
}

export function AssetContract(props: { asset: AssetData }): React.JSX.Element {
	return (
		<span {...cx(link(), styles.mono())}>
			{HexFormatter.truncate(props.asset.address, 10)}
		</span>
	)
}

export function AssetCurrency(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.currency) return <span {...styles.tertiary()}>—</span>
	return <span>{asset.metadata.currency}</span>
}

export function AssetAmount(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span {...styles.tertiary()}>…</span>
	const formatted = formatUnits(asset.balance, asset.metadata.decimals)
	const display = PriceFormatter.formatAmountFull(formatted)
	return (
		<span {...truncate()} title={display}>
			{display}
		</span>
	)
}

export function AssetValue(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	const { isTokenListed } = useTokenListMembership()
	if (!isTokenListed(getTempoChain().id, asset.address))
		return <span {...styles.tertiary()}>—</span>
	const value = getAssetValue(asset)
	if (!value) return <span {...styles.tertiary()}>…</span>
	if (value.currency !== 'USD') return <span {...styles.tertiary()}>—</span>
	return (
		<span>
			{PriceFormatter.format(value.amount, {
				decimals: value.decimals,
				format: 'short',
			})}
		</span>
	)
}

namespace styles {
	export const tertiary = style({ color: 'content.tertiary' })

	export const name = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const nameIcon = style({
		flexShrink: '0 !custom',
		height: '20',
		width: '20',
	})

	export const mono = style({
		fontFamily: '"JetBrains Mono", monospace',
		fontWeight: 400,
		letterSpacing: '0px',
	})
}
