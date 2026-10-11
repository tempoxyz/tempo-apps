import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { cx } from '#lib/css'
import {
	groupTokenAuthorities,
	pauseStatusLabel,
	policyDescriptions,
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
		<div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] border-t border-distinct px-[18px] py-5">
			<h2 className="heading-16 col-span-full">Permissions</h2>
			<section aria-label="Transfer policy" className="min-w-0">
				<div className="flex items-start justify-between gap-2 mb-3">
					<h3 className="font-medium">Transfer policy</h3>
					{policy && <PolicyLink policy={policy.policy} />}
				</div>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col items-start gap-3 md:flex-row-reverse md:justify-between">
						<span
							role="status"
							aria-label="Token pause status"
							title={
								policy?.paused === false
									? 'Token is not paused. Transfer policy restrictions still apply.'
									: undefined
							}
							className={cx(
								'inline-flex shrink-0 items-center rounded-[5px] px-[5px] py-[1px] label-12 whitespace-nowrap',
								policy?.paused === true && 'bg-warning/15 text-warning',
								policy?.paused !== true && 'bg-distinct',
								policy?.paused === false && 'text-inherit',
								policy?.paused == null && 'text-tertiary',
							)}
						>
							{policyQuery.isPending
								? 'Loading status…'
								: pauseStatusLabel(policy?.paused)}
						</span>
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
								<div className="flex flex-col gap-2 label-12 text-secondary">
									<p>{policyDescriptions[policy.policy.type]}</p>
									<p className="text-tertiary">
										Token admins can replace this policy.
									</p>
								</div>
							)
						)}
					</div>
					<AddressPolicyChecker
						key={`${chainId}:${props.address}`}
						address={props.address}
						chainId={chainId}
						policy={policy}
					/>
				</div>
			</section>
			<section aria-label="Privileged addresses" className="min-w-0">
				<h3 className="font-medium mb-3">Privileged addresses</h3>
				<div className="flex flex-col gap-3">
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
						<div className="flex flex-col divide-y divide-distinct">
							{groups.map((group) => (
								<div
									key={group.account}
									className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
								>
									<p className="copy-13 font-medium">
										{group.permissions
											.filter((permission) => permission.policyId === undefined)
											.map((permission) =>
												permission.label.startsWith('Can ') ||
												permission.description.startsWith('Custom token role.')
													? permission.label
													: `Can ${permission.label.charAt(0).toLowerCase()}${permission.label.slice(1)}`,
											)
											.join(' · ') || 'Policy administration'}
									</p>
									<Link
										to="/address/$address"
										params={{ address: group.account }}
										className="font-mono label-12 break-all text-accent hover:underline"
									>
										{group.account}
									</Link>
									{group.roles.length > 0 && (
										<details className="label-12">
											<summary className="cursor-pointer text-secondary hover:text-primary">
												Roles & grant history
											</summary>
											<dl className="flex flex-col gap-3 pt-3">
												{group.roles.map((role) => (
													<div
														key={role.roleHash}
														className="grid gap-1 md:grid-cols-[140px_minmax(0,1fr)_auto] md:gap-3"
													>
														<dt className="font-mono label-12 break-all">
															{role.role}
														</dt>
														<dd className="text-secondary">
															{tokenRoleDescription(role.role)}
														</dd>
														<dd className="flex items-baseline gap-2 md:justify-end label-12 whitespace-nowrap">
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
																	params={{
																		hash: role.grantedTx as `0x${string}`,
																	}}
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
											</dl>
										</details>
									)}
									<dl className="flex flex-col gap-3 label-12">
										{group.permissions.map(
											(permission, index) =>
												permission.policyId !== undefined && (
													<div
														key={`${permission.policyId}:${index}`}
														className="grid gap-1 md:grid-cols-[140px_minmax(0,1fr)] md:gap-3"
													>
														<dt>{permission.label}</dt>
														<dd className="text-secondary">
															{permission.description}
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
			<span className="label-12 text-tertiary">{policyLabel(policy)}</span>
		</span>
	)
}

function Unavailable(props: {
	message: string
	onRetry: () => void
}): React.JSX.Element {
	return (
		<div role="status" className="label-12 text-tertiary">
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
		<div className="flex flex-col gap-3 label-12">
			<details className="border-t border-dashed border-distinct pt-3 label-12">
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
							className="min-w-0 flex-1 rounded-[5px] border border-distinct bg-transparent px-2 py-1.5 font-mono label-12"
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
				<div aria-live="polite" className="pt-3">
					{account && query.isFetching ? (
						<p className="text-tertiary">Checking current policy…</p>
					) : account && query.isError ? (
						<Unavailable
							message="Could not check this address."
							onRetry={() => void query.refetch()}
						/>
					) : displayedPolicy ? (
						<PolicyCheckResult result={displayedPolicy} />
					) : null}
				</div>
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
			{result.checks && (
				<p className="text-tertiary">Checked at block {result.blockNumber}.</p>
			)}
		</div>
	)
}
