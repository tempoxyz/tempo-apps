import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { formatUnits, toFunctionSelector, toFunctionSignature } from 'viem'
import { Hooks } from 'wagmi/tempo'
import {
	formatKeyExpiry,
	formatKeyPeriod,
	groupKeyScopes,
	type KeyAuthorization,
} from '#lib/domain/access-key'
import { isTip20Address } from '#lib/domain/tip20'
import { useAutoloadAbi } from '#lib/queries'

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
		<section
			aria-label="Access key permissions"
			className="min-w-0 border-l border-base-border pl-[10px] font-sans text-[12px] text-primary"
		>
			<dl className="flex flex-col gap-[10px]">
				<PermissionRow label="Expires">
					{formatKeyExpiry(authorization.expiry)}
				</PermissionRow>
				<PermissionRow label="Key management">
					{authorization.isAdmin ? 'Admin access' : 'No admin access'}
				</PermissionRow>
				<PermissionRow label="Spend limits">
					{authorization.limits === undefined ? (
						<p className="text-secondary">Unrestricted</p>
					) : authorization.limits.length === 0 ? (
						<p className="text-secondary">No spending allowed</p>
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
						<p className="text-secondary">Any contract and function</p>
					) : targets.length === 0 ? (
						<p className="text-secondary">No calls allowed</p>
					) : (
						<ul className="flex flex-col gap-[12px]">
							{targets.map((target) => (
								<CallScope key={target.address} target={target} />
							))}
						</ul>
					)}
				</PermissionRow>
			</dl>
		</section>
	)
}

// Match the compact label/value rows in decoded event and calldata details.
function PermissionRow(props: {
	label: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="grid grid-cols-1 gap-[4px]">
			<dt className="text-[11px] text-tertiary">{props.label}</dt>
			<dd className="flex min-w-0 flex-col gap-[6px]">{props.children}</dd>
		</div>
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
			<div className="flex min-w-0 flex-col items-start gap-[8px] font-sans">
				<button
					type="button"
					aria-expanded={expanded}
					aria-controls={id}
					onClick={() => setExpanded(!expanded)}
					className="text-[12px] text-accent cursor-pointer press-down"
				>
					{expanded ? 'Hide permissions' : 'Show permissions'}
				</button>
				<div id={id} hidden={!expanded} className="w-full min-w-0">
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
			className="break-all font-mono text-[11px] text-accent hover:underline"
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
		<div className="flex min-w-0 flex-col gap-[4px]">
			<div className="flex flex-wrap items-baseline gap-x-[8px] gap-y-[2px]">
				<div className="flex min-w-0 flex-wrap items-baseline gap-[4px]">
					<span className="break-all tabular-nums">{formatted}</span>
					<span>{metadata?.symbol ?? 'base units'}</span>
				</div>
				<span className="text-secondary">{formatKeyPeriod(limit.period)}</span>
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
		<li className="flex min-w-0 flex-col gap-[4px]">
			<PermissionAddress address={target.address} />
			<ul className="flex flex-col gap-[8px] border-l border-card-border pl-[8px]">
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
						<li
							key={`${rule.selector}-${index}`}
							className="flex min-w-0 flex-col gap-[4px]"
						>
							<div className="flex flex-wrap items-baseline gap-x-[6px] gap-y-[2px]">
								<code
									className="break-all text-[11px]"
									title={
										abiFunction?.type === 'function'
											? toFunctionSignature(abiFunction)
											: undefined
									}
								>
									{functionName ?? rule.selector ?? 'Any function'}
								</code>
								{functionName && (
									<code className="text-[11px] text-tertiary">
										{rule.selector}
									</code>
								)}
							</div>
							{/* TIP-1011 only supports recipient scoping for these TIP-20 methods. */}
							{signature && (
								<div className="text-[11px] text-secondary">
									{rule.recipients?.length ? (
										<div className="flex min-w-0 flex-col gap-1">
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
