import { Link } from '@tanstack/react-router'
import {
	InlineCode,
	SimpleTable,
	TextButton,
	style,
} from '@tempoxyz/ds/platform'
import { useId, useState } from 'react'
import { formatUnits, toFunctionSelector, toFunctionSignature } from 'viem'
import { Hooks } from 'wagmi/tempo'
import { cx } from 'zyzz'
import {
	formatKeyExpiry,
	formatKeyPeriod,
	groupKeyScopes,
	type KeyAuthorization,
} from '#lib/domain/access-key'
import { isTip20Address } from '#lib/domain/tip20'
import { useAutoloadAbi } from '#lib/queries'
import { link, linkHover } from '#styles/explorer'

// InlineCode keeps code on one line; long signatures must wrap in narrow
// description columns.
const wrap = { overflowWrap: 'anywhere', whiteSpace: 'normal' } as const

const tokenFunctions: Record<string, string> = {
	'0x095ea7b3': 'approve(address,uint256)',
	'0xa9059cbb': 'transfer(address,uint256)',
	'0x95777d59': 'transferWithMemo(address,uint256,bytes32)',
}

export function TxKeyAuthorization(
	props: TxKeyAuthorization.Props,
): React.JSX.Element {
	const { authorization, tokenMetadata } = props
	const targets = groupKeyScopes(authorization.scopes)
	return (
		<section aria-label="Access key permissions" {...styles.root()}>
			<SimpleTable>
				<PermissionRow label="Expires">
					{formatKeyExpiry(authorization.expiry)}
				</PermissionRow>
				<PermissionRow label="Key management">
					{authorization.isAdmin ? 'Admin access' : 'No admin access'}
				</PermissionRow>
				<PermissionRow label="Spend limits">
					{authorization.limits === undefined ? (
						<p {...styles.secondary()}>Unrestricted</p>
					) : authorization.limits.length === 0 ? (
						<p {...styles.secondary()}>No spending allowed</p>
					) : (
						authorization.limits.map((limit) => (
							<SpendingLimit
								key={limit.token}
								limit={limit}
								metadata={tokenMetadata?.[limit.token.toLowerCase()]}
							/>
						))
					)}
				</PermissionRow>
				<PermissionRow label="Allowed calls">
					{targets === undefined ? (
						<p {...styles.secondary()}>Any contract and function</p>
					) : targets.length === 0 ? (
						<p {...styles.secondary()}>No calls allowed</p>
					) : (
						<ul {...styles.targets()}>
							{targets.map((target) => (
								<CallScope key={target.address} target={target} />
							))}
						</ul>
					)}
				</PermissionRow>
			</SimpleTable>
		</section>
	)
}

function PermissionRow(props: {
	label: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<SimpleTable.Row>
			<SimpleTable.Dt>{props.label}</SimpleTable.Dt>
			<SimpleTable.Dd {...styles.value()}>{props.children}</SimpleTable.Dd>
		</SimpleTable.Row>
	)
}

export namespace TxKeyAuthorization {
	export type Props = {
		authorization: KeyAuthorization
		tokenMetadata?:
			| Record<string, { decimals: number; symbol: string }>
			| undefined
	}

	export function Disclosure(props: Props): React.JSX.Element {
		const [expanded, setExpanded] = useState(false)
		const id = useId()
		return (
			<div {...styles.disclosure()}>
				<TextButton
					aria-expanded={expanded}
					aria-controls={id}
					onClick={() => setExpanded(!expanded)}
				>
					{expanded ? 'Hide permissions' : 'Show permissions'}
				</TextButton>
				<div id={id} hidden={!expanded} {...styles.panel()}>
					{expanded && <TxKeyAuthorization {...props} />}
				</div>
			</div>
		)
	}
}

function PermissionAddress(props: {
	address: `0x${string}`
}): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.address }}
			{...cx(styles.address(), link(), linkHover())}
		>
			{props.address}
		</Link>
	)
}

function SpendingLimit(props: {
	limit: NonNullable<KeyAuthorization['limits']>[number]
	metadata?: { decimals: number; symbol: string } | undefined
}): React.JSX.Element {
	const { limit } = props
	const { data } = Hooks.token.useGetMetadata({
		token: limit.token,
		query: { enabled: !props.metadata },
	})
	const metadata = props.metadata ?? data
	const amount = metadata
		? formatUnits(limit.limit, metadata.decimals)
		: limit.limit.toString()
	// Group only the integer part; never round away a small allowance.
	const [integer, fraction] = amount.split('.')
	const formatted = `${BigInt(integer).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`
	return (
		<div {...styles.stack()}>
			<div {...styles.limitLine()}>
				<div {...styles.limitAmount()}>
					<span {...styles.amount()}>{formatted}</span>
					<span>{metadata?.symbol ?? 'base units'}</span>
				</div>
				<span {...styles.secondary()}>{formatKeyPeriod(limit.period)}</span>
			</div>
			<PermissionAddress address={limit.token} />
		</div>
	)
}

function CallScope(props: {
	target: NonNullable<ReturnType<typeof groupKeyScopes>>[number]
}): React.JSX.Element {
	const { target } = props
	const { data: abi } = useAutoloadAbi({
		address: target.address,
		enabled: true,
	})
	return (
		<li {...styles.stack()}>
			<PermissionAddress address={target.address} />
			<ul {...styles.rules()}>
				{target.rules.map((rule, index) => {
					const selector = rule.selector?.toLowerCase()
					const abiFunction = abi?.find(
						(item) =>
							item.type === 'function' && toFunctionSelector(item) === selector,
					)
					const signature =
						selector && isTip20Address(target.address)
							? tokenFunctions[selector]
							: undefined
					const functionName =
						signature ??
						(abiFunction?.type === 'function' ? abiFunction.name : undefined)
					return (
						<li key={`${rule.selector}-${index}`} {...styles.stack()}>
							<div {...styles.ruleLine()}>
								<InlineCode
									style={wrap}
									title={
										abiFunction?.type === 'function'
											? toFunctionSignature(abiFunction)
											: undefined
									}
								>
									{functionName ?? rule.selector ?? 'Any function'}
								</InlineCode>
								{functionName && (
									<InlineCode style={wrap}>{rule.selector}</InlineCode>
								)}
							</div>
							{/* TIP-1011 only supports recipient scoping for these TIP-20 methods. */}
							{signature && (
								<div {...styles.recipients()}>
									{rule.recipients?.length ? (
										<div {...styles.stack()}>
											<span>
												{selector === '0x095ea7b3' ? 'Spenders' : 'Recipients'}
											</span>
											{rule.recipients.map((recipient) => (
												<PermissionAddress
													key={recipient}
													address={recipient}
												/>
											))}
										</div>
									) : (
										<span>
											{selector === '0x095ea7b3'
												? 'Any spender'
												: 'Any recipient'}
										</span>
									)}
								</div>
							)}
						</li>
					)
				})}
			</ul>
		</li>
	)
}

namespace styles {
	export const root = style({ minWidth: '0 !custom' })

	// SimpleTable.Dd leaves its layout unset.
	export const value = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const secondary = style({ color: 'content.secondary' })

	export const targets = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
	})

	export const disclosure = style({
		alignItems: 'flex-start',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const panel = style({
		minWidth: '0 !custom',
		width: '100% !custom',
	})

	export const address = style({
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const stack = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const limitLine = style({
		alignItems: 'baseline',
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
		rowGap: '2',
	})

	export const limitAmount = style({
		alignItems: 'baseline',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const amount = style({
		fontVariantNumeric: 'tabular-nums',
		wordBreak: 'break-all',
	})

	export const rules = style({
		borderColor: 'line.secondary',
		borderLeftWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingLeft: '8',
	})

	export const ruleLine = style({
		alignItems: 'baseline',
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
		rowGap: '4',
	})

	export const recipients = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})
}
