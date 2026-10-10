import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button, style, variants } from '@tempoxyz/ds/platform'
import * as Address from 'ox/Address'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { cx } from 'zyzz'
import { Address as AddressLink } from '#comps/Address'
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
import { link, linkHover } from '#styles/explorer'

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
	const pauseState =
		policy?.paused === true
			? 'paused'
			: policy?.paused === false
				? 'active'
				: 'unknown'
	return (
		<div {...styles.root()}>
			<h3 {...styles.heading()}>Trust & permissions</h3>
			<section aria-label="Transfer policy" {...styles.panel()}>
				<div {...styles.panelHeader()}>
					<h4 {...styles.panelTitle()}>Transfer policy</h4>
					{policy && <PolicyLink policy={policy.policy} />}
				</div>
				<div {...styles.panelBody()}>
					<div {...styles.status()}>
						<span
							role="status"
							aria-label="Token pause status"
							title={
								policy?.paused === false
									? 'Token is not paused. Transfer policy restrictions still apply.'
									: undefined
							}
							{...styles.pause({ state: pauseState })}
						>
							{policyQuery.isPending
								? 'Loading status…'
								: pauseStatusLabel(policy?.paused)}
						</span>
						{policyQuery.isPending ? (
							<p {...styles.muted()} role="status">
								Loading transfer policy…
							</p>
						) : policyQuery.isError ? (
							<Unavailable
								message="Transfer policy unavailable."
								onRetry={() => void policyQuery.refetch()}
							/>
						) : (
							policy && (
								<div {...styles.policyDescription()}>
									<p>{policyDescriptions[policy.policy.type]}</p>
									<p {...styles.muted()}>
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
			<section aria-label="Privileged addresses" {...styles.panel()}>
				<h4 {...cx(styles.panelHeader(), styles.panelTitle())}>
					Privileged addresses
				</h4>
				<div {...styles.panelBody()}>
					{props.loading ? (
						<p {...styles.muted()} role="status">
							Loading token roles…
						</p>
					) : props.unavailable ? (
						<Unavailable
							message="Token roles unavailable. Policy permissions below may still be shown."
							onRetry={props.onRetry}
						/>
					) : (
						props.roles.length === 0 && (
							<p {...styles.muted()}>No current token role holders found.</p>
						)
					)}
					{groups.length > 0 && (
						<div {...styles.groups()}>
							{groups.map((group) => (
								<div key={group.account} {...styles.group()}>
									<AddressLink
										address={group.account}
										className={styles.groupAddress().className}
									/>
									<dl {...styles.roles()}>
										{group.roles.map((role) => (
											<div key={role.roleHash} {...styles.roleRow()}>
												<dt {...styles.roleName()}>{role.role}</dt>
												<dd {...styles.secondary()}>
													{tokenRoleDescription(role.role)}
												</dd>
												<dd {...styles.roleMeta()}>
													{role.grantedAt != null && (
														<span {...styles.muted()}>
															{new Date(
																role.grantedAt * 1000,
															).toLocaleDateString('en-US')}
														</span>
													)}
													{role.grantedTx ? (
														<Link
															to="/tx/$hash"
															params={{ hash: role.grantedTx as `0x${string}` }}
															{...cx(link(), linkHover())}
															aria-label={`View ${role.role} grant transaction for ${group.account}`}
														>
															Grant tx ↗
														</Link>
													) : (
														<span {...styles.muted()}>
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
														{...styles.roleRow()}
													>
														<dt>{permission.label}</dt>
														<dd {...styles.secondary()}>
															{permission.description}
														</dd>
														<dd {...styles.permissionLink()}>
															<Link
																to="/policy/$id"
																params={{ id: permission.policyId }}
																{...cx(link(), linkHover())}
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
		<span {...styles.policyLink()}>
			<Link
				to="/policy/$id"
				params={{ id: policy.id }}
				{...cx(link(), linkHover())}
			>
				#{policy.id}
			</Link>
			<span {...styles.policyLabel()}>{policyLabel(policy)}</span>
		</span>
	)
}

function Unavailable(props: {
	message: string
	onRetry: () => void
}): React.JSX.Element {
	return (
		<div role="status" {...styles.unavailable()}>
			{props.message}{' '}
			<button
				type="button"
				onClick={props.onRetry}
				{...cx(styles.textButton(), link(), linkHover())}
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
		<div {...styles.checker()}>
			<details {...styles.details()}>
				<summary {...cx(styles.summary(), link())}>Check an address</summary>
				<form
					{...styles.form()}
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
					<label htmlFor={id} {...styles.secondary()}>
						Send, receive and mint receipt permissions
					</label>
					<div {...styles.inputRow()}>
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
							{...styles.input()}
						/>
						<Button
							type="submit"
							disabled={query.isFetching}
							scale="small"
							variant="secondary"
							{...styles.submit()}
						>
							{query.isFetching ? 'Checking…' : 'Check'}
						</Button>
					</div>
					{invalid && (
						<p id={`${id}-error`} role="alert" {...styles.negative()}>
							Enter a valid address.
						</p>
					)}
				</form>
				<div aria-live="polite" {...styles.live()}>
					{account && query.isFetching ? (
						<p {...styles.muted()}>Checking current policy…</p>
					) : account && query.isError ? (
						<Unavailable
							message="Could not check this address."
							onRetry={() => void query.refetch()}
						/>
					) : displayedPolicy ? (
						<PolicyCheckResult result={displayedPolicy} />
					) : null}
				</div>
				<p {...styles.disclaimer()}>
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
		<div {...styles.result()}>
			{(result.components.length > 0 || result.checks) && (
				<dl {...styles.result()} aria-label="Policy permissions">
					{tokenPolicyRows(result).map((row) => (
						<div key={row.scope} {...styles.resultRow()}>
							<dt {...styles.secondary()}>{row.label}</dt>
							<dd {...styles.resultValue()}>
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
				<p {...styles.muted()}>Checked at block {result.blockNumber}.</p>
			)}
		</div>
	)
}

namespace styles {
	export const root = style({
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		borderTopWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		marginTop: '16',
		paddingTop: '16',
	})

	export const heading = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const panel = style({
		borderColor: 'line.secondary',
		borderRadius: '2xs',
		borderWidth: 'regular',
		overflow: 'hidden',
	})

	export const panelHeader = style({
		alignItems: 'flex-start',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		paddingBlock: '12',
		paddingInline: '12',
	})

	export const panelTitle = style({ typography: 'body.b2Strong' })

	export const panelBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		padding: '12',
	})

	export const status = style({
		alignItems: 'flex-start',
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		'@media (width >= 768px)': {
			flexDirection: 'row-reverse',
			justifyContent: 'space-between',
		},
	})

	export const pause = variants({
		base: {
			alignItems: 'center',
			borderRadius: 'full',
			display: 'inline-flex',
			flexShrink: 0,
			paddingBlock: '2',
			paddingInline: '8',
			typography: 'body.b3',
			whiteSpace: 'nowrap',
		},
		defaultVariants: { state: 'unknown' },
		variants: {
			state: {
				active: {
					backgroundColor: 'container.regular',
					color: 'inherit !custom',
				},
				paused: {
					backgroundColor: 'container.warning',
					color: 'content.warning',
				},
				unknown: {
					backgroundColor: 'container.regular',
					color: 'content.tertiary',
				},
			},
		},
	})

	export const muted = style({ color: 'content.tertiary' })

	export const secondary = style({ color: 'content.secondary' })

	export const negative = style({ color: 'content.negative' })

	export const policyDescription = style({
		color: 'content.secondary',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		typography: 'body.b3',
	})

	export const groups = style({
		display: 'flex',
		flexDirection: 'column',
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: 'regular',
				borderColor: 'line.secondary',
				borderStyle: 'dashed',
			},
		},
	})

	export const group = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '12',
		typography: 'body.b3',
		':first-child': { paddingTop: 'none' },
		':last-child': { paddingBottom: 'none' },
	})

	export const groupAddress = style({ wordBreak: 'break-all' })

	export const roles = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		typography: 'body.b3',
	})

	export const roleRow = style({
		display: 'grid',
		gap: '4',
		'@media (width >= 768px)': {
			gap: '12',
			gridTemplateColumns: '140px minmax(0, 1fr) auto',
		},
	})

	export const roleName = style({
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const roleMeta = style({
		alignItems: 'baseline',
		display: 'flex',
		gap: '8',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
		'@media (width >= 768px)': { justifyContent: 'flex-end' },
	})

	export const permissionLink = style({
		typography: 'body.b3',
		'@media (width >= 768px)': { textAlign: 'right' },
	})

	export const policyLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
	})

	export const policyLabel = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const unavailable = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const textButton = style({ cursor: 'pointer' })

	export const checker = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		typography: 'body.b3',
	})

	export const details = style({
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		borderTopWidth: 'regular',
		paddingTop: '12',
		typography: 'body.b3',
	})

	export const summary = style({ cursor: 'pointer' })

	export const form = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingTop: '12',
	})

	export const inputRow = style({ display: 'flex', gap: '8' })

	// Mirrors TDS TextInput (filled, borderless) at the small button height.
	export const input = style({
		backgroundColor: 'component.input.primary.fill',
		borderRadius: '2xs',
		color: 'content.primary',
		flex: 1,
		minWidth: '0px !custom',
		paddingBlock: '8',
		paddingInline: '12',
		typography: 'mono.inline',
		'::placeholder': { color: 'content.tertiary' },
	})

	// TDS Button has no disabled treatment of its own.
	export const submit = style({
		flexShrink: 0,
		':disabled': { opacity: 0.5 },
	})

	export const live = style({ paddingTop: '12' })

	export const disclaimer = style({
		color: 'content.tertiary',
		paddingTop: '8',
	})

	export const result = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const resultRow = style({
		alignItems: 'baseline',
		columnGap: '12',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		rowGap: '4',
	})

	export const resultValue = style({
		alignItems: 'baseline',
		columnGap: '12',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'flex-end',
		rowGap: '4',
	})
}
