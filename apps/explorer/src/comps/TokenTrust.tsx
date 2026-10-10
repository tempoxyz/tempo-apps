import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	Alert,
	Button,
	IconButton,
	SimpleTable,
	StatusIndicator,
	TextInput,
	Tooltip,
	style,
	vars,
} from '@tempoxyz/ds/platform'
import { AlertCircle, InfoCircle } from '@tempoxyz/ds/platform/icons'
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
	const pauseTone =
		policy?.paused === true
			? 'warning'
			: policy?.paused === false
				? 'positive'
				: 'neutral'
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
						<span {...styles.pause()}>
							<StatusIndicator
								role="status"
								aria-label="Token pause status"
								tone={pauseTone}
							>
								{policyQuery.isPending
									? 'Loading status…'
									: pauseStatusLabel(policy?.paused)}
							</StatusIndicator>
							{policy?.paused === false && (
								<Tooltip content="Policy restrictions still apply">
									<IconButton
										aria-label="Policy restrictions still apply"
										scale="small"
										variant="tertiary"
									>
										<InfoCircle />
									</IconButton>
								</Tooltip>
							)}
						</span>
						{policyQuery.isPending ? (
							<p {...styles.secondary()} role="status">
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
									<p {...styles.secondary()}>
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
						<p {...styles.secondary()} role="status">
							Loading token roles…
						</p>
					) : props.unavailable ? (
						<Unavailable
							message="Token roles unavailable. Policy permissions below may still be shown."
							onRetry={props.onRetry}
						/>
					) : (
						props.roles.length === 0 && (
							<p {...styles.secondary()}>
								No current token role holders found.
							</p>
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
									<SimpleTable>
										{group.roles.map((role) => (
											<SimpleTable.Row key={role.roleHash}>
												<SimpleTable.Dt>
													<span {...styles.roleName()}>{role.role}</span>
												</SimpleTable.Dt>
												<SimpleTable.Dd>
													<span {...styles.block()}>
														{tokenRoleDescription(role.role)}
													</span>
													<span {...styles.meta()}>
														{role.grantedAt != null && (
															<span>
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
																{...cx(link(), linkHover())}
																aria-label={`View ${role.role} grant transaction for ${group.account}`}
															>
																Grant tx ↗
															</Link>
														) : (
															<span>Grant transaction unavailable</span>
														)}
													</span>
												</SimpleTable.Dd>
											</SimpleTable.Row>
										))}
										{group.permissions.map(
											(permission, index) =>
												permission.policyId !== undefined && (
													<SimpleTable.Row
														key={`${permission.policyId}:${index}`}
													>
														<SimpleTable.Dt>{permission.label}</SimpleTable.Dt>
														<SimpleTable.Dd>
															<span {...styles.block()}>
																{permission.description}
															</span>
															<span {...styles.meta()}>
																<Link
																	to="/policy/$id"
																	params={{ id: permission.policyId }}
																	{...cx(link(), linkHover())}
																>
																	Policy #{permission.policyId} activity ↗
																</Link>
															</span>
														</SimpleTable.Dd>
													</SimpleTable.Row>
												),
										)}
									</SimpleTable>
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
		<Alert
			role="status"
			tone="negative"
			title={props.message}
			action={{ label: 'Try again', onClick: props.onRetry }}
		/>
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
				<div {...styles.inputRow()}>
					<TextInput
						id={id}
						label="Send, receive and mint receipt permissions"
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
						className={styles.control().className}
					/>
					<Button
						type="submit"
						disabled={query.isFetching}
						scale="large"
						variant="secondary"
						{...styles.submit()}
					>
						{query.isFetching ? 'Checking…' : 'Check'}
					</Button>
				</div>
				{invalid && (
					<p id={`${id}-error`} role="alert" {...styles.fieldError()}>
						<AlertCircle {...styles.fieldErrorIcon()} />
						Enter a valid address.
					</p>
				)}
			</form>
			<div aria-live="polite" {...styles.live()}>
				{account && query.isFetching ? (
					<p {...styles.secondary()}>Checking current policy…</p>
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
				<SimpleTable aria-label="Policy permissions">
					{tokenPolicyRows(result).map((row) => (
						<SimpleTable.Row key={row.scope}>
							<SimpleTable.Dt>{row.label}</SimpleTable.Dt>
							<SimpleTable.Dd {...styles.resultValue()}>
								{result.components.length > 0 && (
									<PolicyLink policy={row.policy} />
								)}
								{result.checks && (
									<StatusIndicator
										tone={
											row.allowed === null
												? 'neutral'
												: row.allowed
													? 'positive'
													: 'negative'
										}
									>
										{row.allowed === null
											? 'Unavailable'
											: row.allowed
												? 'Permitted by policy'
												: 'Blocked by policy'}
									</StatusIndicator>
								)}
							</SimpleTable.Dd>
						</SimpleTable.Row>
					))}
				</SimpleTable>
			)}
			{result.checks && (
				<p {...styles.secondary()}>Checked at block {result.blockNumber}.</p>
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
		color: 'content.secondary',
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
		padding: '12',
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

	export const pause = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: 0,
		gap: '4',
	})

	export const secondary = style({ color: 'content.secondary' })

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

	export const roleName = style({
		typography: 'mono.inline',
		wordBreak: 'break-all',
	})

	export const block = style({ display: 'block' })

	export const meta = style({
		color: 'content.secondary',
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
		marginTop: '4',
		typography: 'body.b3',
	})

	export const policyLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
	})

	export const policyLabel = style({
		color: 'content.secondary',
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

	// TextInput caps itself at 320px; addresses need the full row.
	export const inputRow = style({
		alignItems: 'flex-end',
		display: 'flex',
		gap: '8',
		selectors: { '& > div': { flex: 1 } },
	})

	export const control = style({
		'::placeholder': { color: 'content.secondary' },
		selectors: {
			'&[aria-invalid="true"]': {
				boxShadow: `inset 0 0 0 1px ${vars.color.border.negative} !custom`,
			},
		},
	})

	// TDS Button has no disabled treatment of its own.
	export const submit = style({
		flexShrink: 0,
		':disabled': { opacity: 0.5 },
	})

	export const fieldError = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '4',
	})

	export const fieldErrorIcon = style({
		color: 'content.negative',
		flexShrink: 0,
	})

	export const live = style({ paddingTop: '12' })

	export const disclaimer = style({
		color: 'content.secondary',
		paddingTop: '8',
	})

	export const result = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const resultValue = style({
		alignItems: 'center',
		columnGap: '12',
		display: 'flex',
		flexWrap: 'wrap',
		rowGap: '4',
	})
}
