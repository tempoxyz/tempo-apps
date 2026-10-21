import { Link } from '@tanstack/react-router'
import type * as React from 'react'
import { formatUnits } from 'viem'
import { TokenIcon } from '#comps/TokenIcon'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { type AssetData, getAssetValue } from '#lib/address-balances'
import { cx } from '#lib/css'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { getTempoChain } from '#wagmi.config'

export function AssetName(props: {
	asset: AssetData
	multiline?: boolean
}): React.JSX.Element {
	const { asset, multiline = false } = props
	if (!asset.metadata?.name) return <span className="text-tertiary">…</span>
	return (
		<span
			className={cx(
				'inline-flex gap-2 min-w-0',
				multiline ? 'items-start' : 'items-center',
			)}
		>
			<TokenIcon
				address={asset.address}
				name={asset.metadata.name}
				className="size-5 shrink-0"
			/>
			<span className={multiline ? 'min-w-0 wrap-anywhere' : 'truncate'}>
				{asset.metadata.name}
			</span>
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
		<span className="text-accent font-mono">
			{HexFormatter.truncate(props.asset.address, 10)}
		</span>
	)
}

export function AssetCurrency(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	if (!asset.metadata?.currency) return <span className="text-tertiary">—</span>
	return <span>{asset.metadata.currency}</span>
}

export function AssetAmount(props: {
	asset: AssetData
	multiline?: boolean
}): React.JSX.Element {
	const { asset, multiline = false } = props
	if (asset.metadata?.decimals === undefined || asset.balance === undefined)
		return <span className="text-tertiary">…</span>
	const formatted = formatUnits(asset.balance, asset.metadata.decimals)
	const display = PriceFormatter.formatAmountFull(formatted)
	return (
		<span
			className={multiline ? 'min-w-0 wrap-anywhere tabular-nums' : 'truncate'}
			title={display}
		>
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

export function AssetIdentity(props: { asset: AssetData }): React.JSX.Element {
	const { asset } = props
	return (
		<span className="flex min-w-0 flex-col gap-1">
			<AssetName asset={asset} multiline />
			<span
				className="font-mono copy-11 text-accent wrap-anywhere"
				title={asset.address}
			>
				{HexFormatter.truncate(asset.address)}
			</span>
		</span>
	)
}
