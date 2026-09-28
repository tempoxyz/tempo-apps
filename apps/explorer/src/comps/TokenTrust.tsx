import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { Address as AddressLink } from '#comps/Address'
import {
	groupTokenAuthorities,
	policyLabel,
	type TokenPolicy,
	type TransferPolicy,
} from '#lib/domain/token-trust'
import { fetchTokenPolicy } from '#lib/server/token-trust'
import type { RoleHolder } from '#routes/api/tip20-roles'
import InfoIcon from '~icons/lucide/info'

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
					<>
						<div className="flex justify-between gap-3">
							<span className="text-secondary">Paused</span>
							<span>
								{policy.paused === null
									? 'Unavailable'
									: policy.paused
										? 'Yes'
										: 'No'}
							</span>
						</div>
						<div className="flex justify-between gap-3">
							<span className="text-secondary">Transfer policy</span>
							<PolicyLink policy={policy.policy} />
						</div>
						<details className="text-[12px]">
							<summary className="text-accent cursor-pointer">
								Policy details
							</summary>
							<div className="flex flex-col gap-2 pt-2 text-secondary">
								{policy.components.map((component) => (
									<div
										key={component.scope}
										className="flex justify-between gap-3"
									>
										<span>{component.scope}</span>
										<PolicyLink policy={component} />
									</div>
								))}
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
						</details>
					</>
				)
			)}
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
					<p className="text-tertiary">No current token role holders found.</p>
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
							<div className="flex flex-wrap gap-1.5">
								{group.permissions.map((permission, index) => (
									<span
										key={`${permission.label}:${index}`}
										className="inline-flex max-w-full items-center gap-1 rounded-[4px] border border-distinct px-1.5 py-0.5 text-[11px] text-secondary break-all"
										title={permission.description}
									>
										{permission.label}
										{permission.policyId && (
											<Link
												to="/policy/$id"
												params={{ id: permission.policyId }}
												className="text-accent hover:underline"
											>
												#{permission.policyId}
											</Link>
										)}
										<InfoIcon
											className="size-[11px] text-tertiary"
											role="img"
											aria-label={permission.description}
										/>
									</span>
								))}
							</div>
							{group.roles.length > 0 && (
								<details className="text-[11px] text-tertiary">
									<summary className="cursor-pointer">
										Roles & grant details
									</summary>
									<div className="flex flex-col gap-2 pt-2">
										{group.roles.map((role) => (
											<div
												key={role.roleHash}
												className="flex flex-wrap gap-2 items-center"
											>
												<span className="break-all">{role.role}</span>
												{role.grantedAt != null && (
													<span>
														{new Date(role.grantedAt * 1000).toLocaleDateString(
															'en-US',
														)}
													</span>
												)}
												{role.grantedTx && (
													<Link
														to="/tx/$hash"
														params={{ hash: role.grantedTx as `0x${string}` }}
														className="text-accent hover:underline"
													>
														Grant ↗
													</Link>
												)}
											</div>
										))}
									</div>
								</details>
							)}
						</div>
					))}
				</div>
			)}
			<AddressPolicyChecker
				key={`${chainId}:${props.address}`}
				address={props.address}
				chainId={chainId}
			/>
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
}): React.JSX.Element {
	const [value, setValue] = React.useState('')
	const [account, setAccount] = React.useState<Address.Address>()
	const [invalid, setInvalid] = React.useState(false)
	const id = React.useId()
	const query = useQuery({
		queryKey: ['token-policy-check', props.chainId, props.address, account],
		queryFn: () => {
			if (!account) throw new Error('Enter an address to check')
			return fetchTokenPolicy({
				data: {
					token: props.address,
					chainId: props.chainId,
					account,
				},
			})
		},
		enabled: Boolean(account),
		staleTime: 0,
	})
	return (
		<details className="border-t border-dashed border-distinct pt-3 text-[12px]">
			<summary className="cursor-pointer text-accent">Check an address</summary>
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
					Address to check against the token’s policy
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
					) : (
						query.data && <PolicyCheckResult result={query.data} />
					)}
				</div>
			)}
			<p className="text-tertiary pt-2">
				Token policy only; this does not simulate a transfer.
			</p>
		</details>
	)
}

function PolicyCheckResult({
	result,
}: {
	result: TokenPolicy
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2">
			{result.checks?.map((check) => (
				<div key={check.scope} className="flex flex-wrap justify-between gap-2">
					<span className="text-secondary">{check.scope}</span>
					<span>
						{check.allowed === null
							? 'Unavailable'
							: check.allowed
								? 'Permitted by policy'
								: 'Blocked by policy'}{' '}
						<Link
							to="/policy/$id"
							params={{ id: check.policyId }}
							className="text-accent hover:underline"
						>
							#{check.policyId}
						</Link>
					</span>
				</div>
			))}
			<p className="text-tertiary">
				{result.paused === null
					? 'Pause status unavailable.'
					: result.paused
						? 'Token is paused.'
						: 'Token is not paused.'}{' '}
				Checked at block {result.blockNumber}.
			</p>
		</div>
	)
}
