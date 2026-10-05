import { Link } from '@tanstack/react-router'
import type * as React from 'react'
import { formatUnits } from 'viem'
import { TokenIcon } from '#comps/TokenIcon'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { type AssetData, getAssetValue } from '#lib/address-balances'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { getTempoChain } from '#wagmi.config'

export function AssetName(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.name) return <span className="text-tertiary">…</span>
	return (
		<span className="inline-flex items-center gap-2 min-w-0">
			<TokenIcon
				address={asset.address}
				name={asset.metadata.name}
				className="size-5 shrink-0"
			/>
			<span className="truncate">{asset.metadata.name}</span>
		</span>
	)
}

export function AssetSymbol(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.symbol) return <span className="text-tertiary">…</span>
	return (
		<Link
			to="/token/$address"
			params={{ address: asset.address }}
			className="text-accent hover:underline press-down truncate"
		>
			{asset.metadata.symbol}
		</Link>
	)
}

export function AssetContract(props: { asset: AssetData }): React.JSX.Element {
	return (
		<span className="text-accent">
			{HexFormatter.truncate(props.asset.address, 10)}
		</span>
	)
}

export function AssetCurrency(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.currency) return <span className="text-tertiary">—</span>
	return <span>{asset.metadata.currency}</span>
}

export function AssetAmount(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span className="text-tertiary">…</span>
	const formatted = formatUnits(asset.balance, asset.metadata.decimals)
	const display = PriceFormatter.formatAmountFull(formatted)
	return (
		<span className="truncate" title={display}>
			{display}
		</span>
	)
}

export function AssetValue(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	const { isTokenListed } = useTokenListMembership()
	if (!isTokenListed(getTempoChain().id, asset.address))
		return <span className="text-tertiary">—</span>
	const value = getAssetValue(asset)
	if (!value) return <span className="text-tertiary">…</span>
	if (value.currency !== 'USD') return <span className="text-tertiary">—</span>
	return (
		<span>
			{PriceFormatter.format(value.amount, {
				decimals: value.decimals,
				format: 'short',
			})}
		</span>
	)
}
