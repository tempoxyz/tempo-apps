import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { Address as AddressLink } from '#comps/Address'
import {
	groupTokenAuthorities,
	policyLabel,
	tokenPolicyRows,
	tokenRoleDescription,
	type TokenPolicy,
	type TransferPolicy,
} from '#lib/domain/token-trust'
import { fetchTokenPolicy } from '#lib/server/token-trust'
import type { RoleHolder } from '#routes/api/tip20-roles'

export function TokenTrust(props: TokenTrust.Props): React.JSX.Element {
	const chainId = useChainId()
	const policyQuery = useQuery({
		queryKey: ['token-policy', chainId, props.address],
		queryFn: () =>
			fetchTokenPolicy({ data: { token: props.address, chainId } }),
		staleTime: 15_000,
	})
	const policy = policyQuery.isError ? undefined : policyQuery.data
	const groups = groupTokenAuthorities(
		props.unavailable ? [] : props.roles,
		policy,
	)
	return (
		<div className="flex flex-col gap-[14px] border-t border-dashed border-distinct pt-[14px] mt-[14px]">
			<h3 className="text-[13px] text-tertiary">Trust & permissions</h3>
			<section
				aria-label="Transfer policy"
				className="rounded-[6px] border border-distinct overflow-hidden"
			>
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-distinct px-3 py-2.5">
					<h4 className="font-medium">Transfer policy</h4>
					{policy && <PolicyLink policy={policy.policy} />}
				</div>
				<div className="flex flex-col gap-3 p-3">
					{policyQuery.isPending ? (
						<p className="text-tertiary" role="status">
							Loading transfer policy…
						</p>
					) : policyQuery.isError ? (
						<Unavailable
							message="Transfer policy unavailable."
							onRetry={() => void policyQuery.refetch()}
						/>
					) : (
						policy && (
							<div className="flex flex-col gap-2 text-[12px] text-secondary">
								<p>
									{policy.policy.type === 'always-allow'
										? 'This policy permits all accounts. Token admins can still replace it with a restrictive policy.'
										: policy.policy.type === 'always-reject'
											? 'This policy rejects all accounts. Token admins can replace it with another policy.'
											: policy.policy.type === 'compound'
												? 'Each component has its own account rules and administrator. Token admins can replace the whole policy.'
												: policy.policy.type === 'allowlist'
													? 'Only listed accounts are permitted. The policy admin manages the list; token admins can replace the policy.'
													: 'Listed accounts are blocked. The policy admin manages the list; token admins can replace the policy.'}
								</p>
								{policy.policy.type !== 'compound' && !policy.policy.admin && (
									<p>This policy has no list administrator.</p>
								)}
								<Link
									to="/policy/$id"
									params={{ id: policy.policy.id }}
									className="text-accent hover:underline"
								>
									View policy members and activity ↗
								</Link>
							</div>
						)
					)}
					<AddressPolicyChecker
						key={`${chainId}:${props.address}`}
						address={props.address}
						chainId={chainId}
						policy={policy}
					/>
				</div>
			</section>
			<section
				aria-label="Address roles"
				className="rounded-[6px] border border-distinct overflow-hidden"
			>
				<h4 className="border-b border-distinct px-3 py-2.5 font-medium">
					Address roles
				</h4>
				<div className="flex flex-col gap-3 p-3">
					{props.loading ? (
						<p className="text-tertiary" role="status">
							Loading token roles…
						</p>
					) : props.unavailable ? (
						<Unavailable
							message="Token roles unavailable. Policy permissions below may still be shown."
							onRetry={props.onRetry}
						/>
					) : (
						props.roles.length === 0 && (
							<p className="text-tertiary">
								No current token role holders found.
							</p>
						)
					)}
					{groups.length > 0 && (
						<div className="flex flex-col divide-y divide-dashed divide-distinct">
							{groups.map((group) => (
								<div
									key={group.account}
									className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
								>
									<AddressLink
										address={group.account}
										className="text-[12px] break-all"
									/>
									<dl className="flex flex-col gap-3 text-[12px]">
										{group.roles.map((role) => (
											<div
												key={role.roleHash}
												className="grid gap-1 md:grid-cols-[140px_minmax(0,1fr)_auto] md:gap-3"
											>
												<dt className="font-mono text-[11px] break-all">
													{role.role}
												</dt>
												<dd className="text-secondary">
													{tokenRoleDescription(role.role)}
												</dd>
												<dd className="flex items-baseline gap-2 md:justify-end text-[11px] whitespace-nowrap">
													{role.grantedAt != null && (
														<span className="text-tertiary">
															{new Date(
																role.grantedAt * 1000,
															).toLocaleDateString('en-US')}
														</span>
													)}
													{role.grantedTx ? (
														<Link
															to="/tx/$hash"
															params={{ hash: role.grantedTx as `0x${string}` }}
															className="text-accent hover:underline"
															aria-label={`View ${role.role} grant transaction for ${group.account}`}
														>
															Grant tx ↗
														</Link>
													) : (
														<span className="text-tertiary">
															Grant transaction unavailable
														</span>
													)}
												</dd>
											</div>
										))}
										{group.permissions.map(
											(permission, index) =>
												permission.policyId !== undefined && (
													<div
														key={`${permission.policyId}:${index}`}
														className="grid gap-1 md:grid-cols-[140px_minmax(0,1fr)_auto] md:gap-3"
													>
														<dt>Policy admin</dt>
														<dd className="text-secondary">
															<p>{permission.label}</p>
															<p className="text-tertiary">
																{permission.description}
															</p>
														</dd>
														<dd className="md:text-right text-[11px]">
															<Link
																to="/policy/$id"
																params={{ id: permission.policyId }}
																className="text-accent hover:underline"
															>
																Policy #{permission.policyId} activity ↗
															</Link>
														</dd>
													</div>
												),
										)}
									</dl>
								</div>
							))}
						</div>
					)}
				</div>
			</section>
		</div>
	)
}

export declare namespace TokenTrust {
	type Props = {
		address: Address.Address
		roles: RoleHolder[]
		loading: boolean
		unavailable: boolean
		onRetry: () => void
	}
}

function PolicyLink({ policy }: { policy: TransferPolicy }): React.JSX.Element {
	return (
		<span className="inline-flex items-center gap-2">
			<Link
				to="/policy/$id"
				params={{ id: policy.id }}
				className="text-accent hover:underline"
			>
				#{policy.id}
			</Link>
			<span className="text-[11px] text-tertiary">{policyLabel(policy)}</span>
		</span>
	)
}

function Unavailable(props: {
	message: string
	onRetry: () => void
}): React.JSX.Element {
	return (
		<div role="status" className="text-[12px] text-tertiary">
			{props.message}{' '}
			<button
				type="button"
				onClick={props.onRetry}
				className="text-accent hover:underline"
			>
				Try again
			</button>
		</div>
	)
}

function AddressPolicyChecker(props: {
	address: Address.Address
	chainId: number
	policy?: TokenPolicy
}): React.JSX.Element {
	const queryClient = useQueryClient()
	const [value, setValue] = React.useState('')
	const [account, setAccount] = React.useState<Address.Address>()
	const [invalid, setInvalid] = React.useState(false)
	const id = React.useId()
	const query = useQuery({
		queryKey: ['token-policy-check', props.chainId, props.address, account],
		queryFn: async () => {
			if (!account) throw new Error('Enter an address to check')
			const result = await fetchTokenPolicy({
				data: {
					token: props.address,
					chainId: props.chainId,
					account,
				},
			})
			// Keep the policy header and administrator details on the checked snapshot.
			queryClient.setQueryData(['token-policy', props.chainId, props.address], {
				...result,
				checks: null,
			})
			return result
		},
		enabled: Boolean(account),
		staleTime: 0,
	})
	const result =
		account && !query.isFetching && !query.isError ? query.data : undefined
	const displayedPolicy = result ?? props.policy
	return (
		<div className="flex flex-col gap-3 text-[12px]">
			<div aria-live="polite">
				{displayedPolicy && <PolicyCheckResult result={displayedPolicy} />}
			</div>
			<details className="border-t border-dashed border-distinct pt-3 text-[12px]">
				<summary className="cursor-pointer text-accent">
					Check an address
				</summary>
				<form
					className="flex flex-col gap-2 pt-3"
					onSubmit={(event) => {
						event.preventDefault()
						const input = value.trim()
						if (!Address.validate(input)) {
							setInvalid(true)
							setAccount(undefined)
							return
						}
						setInvalid(false)
						if (account === input) void query.refetch()
						else setAccount(input)
					}}
				>
					<label htmlFor={id} className="text-secondary">
						Send, receive and mint receipt permissions
					</label>
					<div className="flex gap-2">
						<input
							id={id}
							value={value}
							onChange={(event) => {
								setValue(event.target.value)
								setAccount(undefined)
								setInvalid(false)
							}}
							placeholder="0x…"
							autoComplete="off"
							spellCheck={false}
							aria-invalid={invalid}
							aria-describedby={invalid ? `${id}-error` : undefined}
							className="min-w-0 flex-1 rounded-[5px] border border-distinct bg-transparent px-2 py-1.5 font-mono text-[12px]"
						/>
						<button
							type="submit"
							disabled={query.isFetching}
							className="text-accent hover:underline disabled:opacity-50"
						>
							{query.isFetching ? 'Checking…' : 'Check'}
						</button>
					</div>
					{invalid && (
						<p id={`${id}-error`} role="alert" className="text-negative">
							Enter a valid address.
						</p>
					)}
				</form>
				{account && (
					<div aria-live="polite" className="pt-3">
						{query.isFetching ? (
							<p className="text-tertiary">Checking current policy…</p>
						) : query.isError ? (
							<Unavailable
								message="Could not check this address."
								onRetry={() => void query.refetch()}
							/>
						) : null}
					</div>
				)}
				<p className="text-tertiary pt-2">
					Token policy only; this does not simulate a transfer.
				</p>
			</details>
		</div>
	)
}

function PolicyCheckResult({
	result,
}: {
	result: TokenPolicy
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2">
			{(result.components.length > 0 || result.checks) && (
				<dl className="flex flex-col gap-2" aria-label="Policy permissions">
					{tokenPolicyRows(result).map((row) => (
						<div
							key={row.scope}
							className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
						>
							<dt className="text-secondary">{row.label}</dt>
							<dd className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
								{result.components.length > 0 && (
									<PolicyLink policy={row.policy} />
								)}
								{result.checks && (
									<span>
										{row.allowed === null
											? 'Unavailable'
											: row.allowed
												? 'Permitted by policy'
												: 'Blocked by policy'}
									</span>
								)}
							</dd>
						</div>
					))}
				</dl>
			)}
			<p className="text-tertiary">
				{result.paused === null
					? 'Pause status unavailable.'
					: result.paused
						? 'Token is paused.'
						: 'Token is not paused.'}{' '}
				{result.checks && <>Checked at block {result.blockNumber}.</>}
			</p>
		</div>
	)
}
