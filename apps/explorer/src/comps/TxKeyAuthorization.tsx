import { Link } from '@tanstack/react-router'
import { formatUnits, toFunctionSelector, toFunctionSignature } from 'viem'
import { Hooks } from 'wagmi/tempo'
import { TokenIcon } from '#comps/TokenIcon'
import {
	formatKeyExpiry,
	formatKeyPeriod,
	groupKeyScopes,
	type KeyAuthorization,
} from '#lib/domain/access-key'
import { isTip20Address } from '#lib/domain/tip20'
import { useAutoloadAbi } from '#lib/queries'
import KeyRoundIcon from '~icons/lucide/key-round'
import CornerDownRightIcon from '~icons/lucide/corner-down-right'

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
			className="min-w-0 rounded-[10px] border border-card-border bg-card font-sans text-[13px] shadow-[0px_4px_44px_rgba(0,0,0,0.05)]"
		>
			<div className="flex flex-wrap items-center justify-between gap-2 rounded-t-[10px] border-b border-card-border bg-card-header px-[18px] py-3">
				<h2 className="flex items-center gap-2 font-medium text-primary">
					<KeyRoundIcon className="size-4 text-accent" />
					Access key permissions
				</h2>
				<span className="rounded border border-card-border px-2 py-0.5 text-[11px] text-secondary">
					{targets === undefined ? 'Unrestricted calls' : 'Scoped calls'}
				</span>
			</div>
			<div className="flex flex-col gap-4 px-[18px] py-4">
				<div className="flex flex-col gap-1">
					<span className="text-tertiary">Access key</span>
					<PermissionAddress address={authorization.address} />
				</div>
				<dl className="grid grid-cols-1 gap-3 border-y border-dashed border-card-border py-3 min-[600px]:grid-cols-[1fr_auto]">
					<div>
						<dt className="text-tertiary">Expires</dt>
						<dd className="mt-1 text-primary">
							{formatKeyExpiry(authorization.expiry)}
						</dd>
					</div>
					<div>
						<dt className="text-tertiary">Key management</dt>
						<dd className="mt-1 text-primary">
							{authorization.isAdmin ? 'Admin access' : 'No admin access'}
						</dd>
					</div>
				</dl>
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-primary">Spend limits</h3>
					{authorization.limits === undefined ? (
						<p className="text-secondary">No token spending limits</p>
					) : authorization.limits.length === 0 ? (
						<p className="text-secondary">No token spending allowed</p>
					) : (
						<>
							{authorization.limits.map((limit) => (
								<SpendingLimit
									key={limit.token}
									limit={limit}
									metadata={tokenMetadata?.[limit.token.toLowerCase()]}
								/>
							))}
							<p className="text-[12px] text-tertiary">
								Other tokens have no spending allowance.
							</p>
						</>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-primary">Allowed calls</h3>
					{targets === undefined ? (
						<p className="text-secondary">
							Any contract and function, subject to protocol restrictions.
						</p>
					) : targets.length === 0 ? (
						<p className="text-secondary">No calls allowed</p>
					) : (
						<>
							{targets.map((target) => (
								<CallScope key={target.address} target={target} />
							))}
							<p className="text-[12px] text-tertiary">
								Only the contracts and functions listed above are allowed.
							</p>
						</>
					)}
				</div>
			</div>
			<p className="border-t border-dashed border-card-border px-[18px] py-3 text-[12px] text-tertiary">
				Permissions in this transaction. Not current permissions or remaining
				balances.
			</p>
		</section>
	)
}

export declare namespace TxKeyAuthorization {
	type Props = {
		authorization: KeyAuthorization
		tokenMetadata?:
			| Record<string, { decimals: number; symbol: string }>
			| undefined
	}
}

function PermissionAddress(props: {
	address: `0x${string}`
}): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.address }}
			className="break-all font-mono text-[12px] text-accent hover:underline"
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
		<div className="rounded-[6px] border border-card-border bg-card-header px-3 py-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 flex-wrap items-center gap-2 text-primary">
					<TokenIcon address={limit.token} name={metadata?.symbol} />
					<span className="break-all text-[18px] font-medium tabular-nums">
						{formatted}
					</span>
					<span>{metadata?.symbol ?? 'base units'}</span>
				</div>
				<span className="text-secondary">{formatKeyPeriod(limit.period)}</span>
			</div>
			<div className="mt-2">
				<PermissionAddress address={limit.token} />
			</div>
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
		<div className="min-w-0 rounded-[6px] border border-card-border">
			<div className="rounded-t-[6px] bg-card-header px-3 py-2">
				<PermissionAddress address={target.address} />
			</div>
			<ul className="divide-y divide-dashed divide-card-border px-3">
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
							className="flex flex-col gap-2 py-3"
						>
							<div className="flex flex-wrap items-center gap-2 text-primary">
								<code
									className="break-all text-[12px]"
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
								{rule.selector && !functionName && (
									<span className="text-[11px] text-tertiary">
										Function selector
									</span>
								)}
							</div>
							<div className="flex items-start gap-2 text-[12px] text-secondary">
								<CornerDownRightIcon className="mt-0.5 size-3 shrink-0 text-tertiary" />
								{rule.recipients?.length ? (
									<div className="flex min-w-0 flex-col gap-1">
										<span>
											{selector === '0x095ea7b3'
												? 'Only these spenders'
												: 'Only these recipients'}
										</span>
										{rule.recipients.map((recipient) => (
											<PermissionAddress key={recipient} address={recipient} />
										))}
									</div>
								) : (
									<span>No recipient restriction</span>
								)}
							</div>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
