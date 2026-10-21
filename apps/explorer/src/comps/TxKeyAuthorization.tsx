import { Link } from '@tanstack/react-router'
import { Amount, Button, Hex, Rows, style } from '@tempoxyz/ds'
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

const tokenFunctions: Record<string, string> = {
	'0x095ea7b3': 'approve(address,uint256)',
	'0xa9059cbb': 'transfer(address,uint256)',
	'0x95777d59': 'transferWithMemo(address,uint256,bytes32)',
}

/** An access key's permissions, as labelled TDS `Rows`. */
export function TxKeyAuthorization(
	props: TxKeyAuthorization.Props,
): React.JSX.Element {
	const { authorization, tokenMetadata } = props
	const targets = groupKeyScopes(authorization.scopes)
	return (
		<section aria-label="Access key permissions" {...styles.root()}>
			<Rows.Root dividers="full">
				<PermissionRow label="Expires">
					{formatKeyExpiry(authorization.expiry)}
				</PermissionRow>
				<PermissionRow label="Key management">
					{authorization.isAdmin ? 'Admin access' : 'No admin access'}
				</PermissionRow>
				<PermissionRow label="Spend limits">
					{authorization.limits === undefined ? (
						<span {...styles.secondary()}>Unrestricted</span>
					) : authorization.limits.length === 0 ? (
						<span {...styles.secondary()}>No spending allowed</span>
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
						<span {...styles.secondary()}>Any contract and function</span>
					) : targets.length === 0 ? (
						<span {...styles.secondary()}>No calls allowed</span>
					) : (
						<ul {...styles.list()}>
							{targets.map((target) => (
								<CallScope key={target.address} target={target} />
							))}
						</ul>
					)}
				</PermissionRow>
			</Rows.Root>
		</section>
	)
}

function PermissionRow(props: {
	label: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<Rows.Row spacing="none">
			<Rows.Label>{props.label}</Rows.Label>
			<span {...styles.value()}>{props.children}</span>
		</Rows.Row>
	)
}

export namespace TxKeyAuthorization {
	export type Props = {
		authorization: KeyAuthorization
		tokenMetadata?:
			| Record<string, { decimals: number; symbol: string }>
			| undefined
	}

	/** A text button that shows the permissions below it, mounted on first open. */
	export function Disclosure(props: Props): React.JSX.Element {
		const [expanded, setExpanded] = useState(false)
		const id = useId()
		return (
			<div {...styles.disclosure()}>
				<Button
					aria-controls={id}
					aria-expanded={expanded}
					onClick={() => setExpanded(!expanded)}
					size="small"
					variant="text"
				>
					{expanded ? 'Hide permissions' : 'Show permissions'}
				</Button>
				<div id={id} hidden={!expanded} {...styles.panel()}>
					{expanded && <TxKeyAuthorization {...props} />}
				</div>
			</div>
		)
	}
}

/** An address in TDS `Hex`, linking to its page, with a copy button. */
function PermissionAddress(props: {
	address: `0x${string}`
}): React.JSX.Element {
	return (
		<Hex.Root value={props.address} {...styles.address()}>
			<Link
				to="/address/$address"
				params={{ address: props.address }}
				{...cx(styles.addressLink(), link(), linkHover())}
			>
				<Hex.Text />
			</Link>
			<Hex.Copy aria-label="Copy address" />
		</Hex.Root>
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
	return (
		<span {...styles.stack()}>
			<span {...styles.limitLine()}>
				{/* The full allowance, never rounded; base units when the token is unknown. */}
				<Amount
					symbol={metadata?.symbol ?? 'base units'}
					value={
						metadata
							? formatUnits(limit.limit, metadata.decimals)
							: limit.limit.toString()
					}
				/>
				<span {...styles.secondary()}>{formatKeyPeriod(limit.period)}</span>
			</span>
			<PermissionAddress address={limit.token} />
		</span>
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
							<span {...styles.ruleLine()}>
								<code
									{...styles.code()}
									title={
										abiFunction?.type === 'function'
											? toFunctionSignature(abiFunction)
											: undefined
									}
								>
									{functionName ?? rule.selector ?? 'Any function'}
								</code>
								{functionName && (
									<code {...cx(styles.code(), styles.secondary())}>
										{rule.selector}
									</code>
								)}
							</span>
							{/* TIP-1011 only supports recipient scoping for these TIP-20 methods. */}
							{signature && (
								<span {...styles.recipients()}>
									{rule.recipients?.length ? (
										<span {...styles.stack()}>
											<span>
												{selector === '0x095ea7b3' ? 'Spenders' : 'Recipients'}
											</span>
											{rule.recipients.map((recipient) => (
												<PermissionAddress
													key={recipient}
													address={recipient}
												/>
											))}
										</span>
									) : (
										<span>
											{selector === '0x095ea7b3'
												? 'Any spender'
												: 'Any recipient'}
										</span>
									)}
								</span>
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

	// The value fills the row after its label, so lists keep their width.
	export const value = style({
		display: 'flex',
		flex: '1 !custom',
		flexDirection: 'column',
		gap: '8',
		minWidth: '0',
		overflowWrap: 'anywhere',
		typography: 'copy.14',
	})

	export const secondary = style({ color: 'gray.900' })

	export const list = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		listStyle: 'none !custom',
		margin: '0',
		padding: '0',
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

	// Function names and selectors are code, so they wrap in a mono set.
	export const code = style({
		overflowWrap: 'anywhere',
		typography: 'copy.13.mono',
	})

	// Hex leaves its width in a column unset.
	export const address = style({ alignSelf: 'flex-start' })

	export const addressLink = style({
		display: 'inline-flex',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
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
		rowGap: '4',
	})

	export const rules = style({
		borderColor: 'grayAlpha.200',
		borderLeftWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		listStyle: 'none !custom',
		margin: '0',
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
		color: 'gray.900',
		typography: 'label.12',
	})
}
