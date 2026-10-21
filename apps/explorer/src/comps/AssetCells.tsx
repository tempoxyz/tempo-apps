import { Link } from '@tanstack/react-router'
import { Amount, Hex, style, Token, variants } from '@tempoxyz/ds'
import type * as React from 'react'
import { formatUnits } from 'viem'
import { cx } from 'zyzz'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { type AssetData, getAssetValue } from '#lib/address-balances'
import { link, linkHover, truncate } from '#styles/explorer'
import { getTempoChain } from '#wagmi.config'

export function AssetName(props: AssetName.Props): React.JSX.Element {
	const { asset, multiline = false } = props
	if (!asset.metadata?.name) return <span {...styles.placeholder()}>…</span>
	return (
		<span {...styles.name({ multiline })}>
			<Token address={asset.address} />
			<span {...(multiline ? styles.wrap() : truncate())}>
				{asset.metadata.name}
			</span>
		</span>
	)
}

export declare namespace AssetName {
	type Props = {
		asset: AssetData
		/** Wraps a long name instead of truncating it. */
		multiline?: boolean | undefined
	}
}

export function AssetSymbol(props: AssetCell.Props): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.symbol) return <span {...styles.placeholder()}>…</span>
	return (
		<Link
			to="/token/$address"
			params={{ address: asset.address }}
			{...cx(link(), linkHover(), truncate())}
		>
			{asset.metadata.symbol}
		</Link>
	)
}

export function AssetContract(props: AssetCell.Props): React.JSX.Element {
	return <Hex value={props.asset.address} />
}

export function AssetCurrency(props: AssetCell.Props): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.currency) return <span {...styles.placeholder()}>—</span>
	return <span>{asset.metadata.currency}</span>
}

export function AssetAmount(props: AssetCell.Props): React.JSX.Element {
	const { asset } = props
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span {...styles.placeholder()}>…</span>
	return (
		<Amount
			align="right"
			symbol={asset.metadata.symbol}
			value={formatUnits(asset.balance, asset.metadata.decimals)}
			{...styles.wrap()}
		/>
	)
}

export function AssetValue(props: AssetCell.Props): React.JSX.Element {
	const { asset } = props
	const { isTokenListed } = useTokenListMembership()
	if (!isTokenListed(getTempoChain().id, asset.address))
		return <span {...styles.placeholder()}>—</span>
	const value = getAssetValue(asset)
	if (!value) return <span {...styles.placeholder()}>…</span>
	if (value.currency !== 'USD') return <span {...styles.placeholder()}>—</span>
	return (
		<Amount
			align="right"
			currency="USD"
			value={formatUnits(value.amount, value.decimals)}
		/>
	)
}

/** Token name above its address, for narrow layouts. */
export function AssetIdentity(props: AssetCell.Props): React.JSX.Element {
	const { asset } = props
	return (
		<span {...styles.identity()}>
			<AssetName asset={asset} multiline />
			<Hex value={asset.address} />
		</span>
	)
}

export declare namespace AssetCell {
	type Props = { asset: AssetData }
}

namespace styles {
	export const placeholder = style({ color: 'gray.900' })

	export const name = variants({
		base: {
			display: 'inline-flex',
			gap: '8',
			minWidth: '0 !custom',
		},
		defaultVariants: { multiline: false },
		variants: {
			multiline: {
				true: { alignItems: 'flex-start' },
				false: { alignItems: 'center' },
			},
		},
	})

	export const wrap = style({ minWidth: '0 !custom', overflowWrap: 'anywhere' })

	export const identity = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})
}
