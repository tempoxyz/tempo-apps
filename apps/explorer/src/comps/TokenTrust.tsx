import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	Button,
	Callout,
	Field,
	Input,
	Rows,
	Tag,
	Tooltip,
	style,
} from '@tempoxyz/ds'
import { AlertCircle, InfoCircle } from '@tempoxyz/ds/icons'
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
							<Tag
								role="status"
								aria-label="Token pause status"
								intent={pauseTone}
								variant="plain"
							>
								<Tag.Dot />
								{policyQuery.isPending
									? 'Loading status…'
									: pauseStatusLabel(policy?.paused)}
							</Tag>
							{policy?.paused === false && (
								<Tooltip.Root>
									<Tooltip.Trigger
										render={
											<Button
												aria-label="Policy restrictions still apply"
												shape="icon"
												size="small"
												variant="text"
											/>
										}
									>
										<InfoCircle {...styles.infoIcon()} />
									</Tooltip.Trigger>
									<Tooltip.Popup>Policy restrictions still apply</Tooltip.Popup>
								</Tooltip.Root>
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
									<Rows dividers="full" size="small">
										{group.roles.map((role) => (
											<Rows.Row key={role.roleHash} spacing="none">
												<Rows.Info>
													<Rows.Title>
														<span {...styles.roleName()}>{role.role}</span>
													</Rows.Title>
													<Rows.Description>
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
													</Rows.Description>
												</Rows.Info>
											</Rows.Row>
										))}
										{group.permissions.map(
											(permission, index) =>
												permission.policyId !== undefined && (
													<Rows.Row
														key={`${permission.policyId}:${index}`}
														spacing="none"
													>
														<Rows.Info>
															<Rows.Title>{permission.label}</Rows.Title>
															<Rows.Description>
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
															</Rows.Description>
														</Rows.Info>
													</Rows.Row>
												),
										)}
									</Rows>
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
		<Callout intent="negative" role="status" size="small">
			<Callout.Icon />
			<Callout.Content>{props.message}</Callout.Content>
			<Callout.Action onClick={props.onRetry}>Try again</Callout.Action>
		</Callout>
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
					<Field.Root invalid={invalid} {...styles.field()}>
						<Field.Label>
							Send, receive and mint receipt permissions
						</Field.Label>
						<Input.Group>
							<Input.Control
								id={id}
								value={value}
								onValueChange={(next) => {
									setValue(next)
									setAccount(undefined)
									setInvalid(false)
								}}
								placeholder="0x…"
								autoComplete="off"
								spellCheck={false}
								aria-describedby={invalid ? `${id}-error` : undefined}
							/>
						</Input.Group>
					</Field.Root>
					<Button
						type="submit"
						disabled={query.isFetching}
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
				<Rows
					aria-label="Policy permissions"
					dividers="full"
					role="group"
					size="small"
				>
					{tokenPolicyRows(result).map((row) => (
						<Rows.Row key={row.scope} spacing="none">
							<Rows.Label>{row.label}</Rows.Label>
							<span {...styles.resultValue()}>
								{result.components.length > 0 && (
									<PolicyLink policy={row.policy} />
								)}
								{result.checks && (
									<Tag
										intent={
											row.allowed === null
												? 'neutral'
												: row.allowed
													? 'positive'
													: 'negative'
										}
										variant="plain"
									>
										<Tag.Dot />
										{row.allowed === null
											? 'Unavailable'
											: row.allowed
												? 'Permitted by policy'
												: 'Blocked by policy'}
									</Tag>
								)}
							</span>
						</Rows.Row>
					))}
				</Rows>
			)}
			{result.checks && (
				<p {...styles.secondary()}>Checked at block {result.blockNumber}.</p>
			)}
		</div>
	)
}

namespace styles {
	export const root = style({
		borderColor: 'grayAlpha.200',
		borderStyle: 'dashed',
		borderTopWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		marginTop: '16',
		paddingTop: '16',
	})

	export const heading = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const panel = style({
		borderColor: 'grayAlpha.200',
		borderRadius: '8',
		borderWidth: '1px',
		overflow: 'hidden',
	})

	export const panelHeader = style({
		alignItems: 'flex-start',
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		display: 'flex',
		gap: '8',
		justifyContent: 'space-between',
		padding: '12',
	})

	export const panelTitle = style({ typography: 'copy.14.strong' })

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

	export const infoIcon = style({ height: '16', width: '16' })

	export const pause = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: 0,
		gap: '4',
	})

	export const secondary = style({ color: 'gray.900' })

	export const policyDescription = style({
		color: 'gray.900',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		typography: 'label.12',
	})

	export const groups = style({
		display: 'flex',
		flexDirection: 'column',
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: '1px',
				borderColor: 'grayAlpha.200',
				borderStyle: 'dashed',
			},
		},
	})

	export const group = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingBlock: '12',
		typography: 'label.12',
		':first-child': { paddingTop: '0' },
		':last-child': { paddingBottom: '0' },
	})

	export const groupAddress = style({ wordBreak: 'break-all' })

	export const roleName = style({
		typography: 'label.12.mono',
		wordBreak: 'break-all',
	})

	export const block = style({ display: 'block' })

	export const meta = style({
		color: 'gray.900',
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
		marginTop: '4',
		typography: 'label.12',
	})

	export const policyLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
	})

	export const policyLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const details = style({
		borderColor: 'grayAlpha.200',
		borderStyle: 'dashed',
		borderTopWidth: '1px',
		paddingTop: '12',
		typography: 'label.12',
	})

	export const summary = style({ cursor: 'pointer' })

	export const form = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingTop: '12',
	})

	export const inputRow = style({
		alignItems: 'flex-end',
		display: 'flex',
		gap: '8',
	})

	export const field = style({ flex: 1, minWidth: '0' })

	export const submit = style({ flexShrink: 0 })

	export const fieldError = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		gap: '4',
	})

	export const fieldErrorIcon = style({
		color: 'red.900',
		flexShrink: 0,
	})

	export const live = style({ paddingTop: '12' })

	export const disclaimer = style({
		color: 'gray.900',
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
		justifyContent: 'flex-end',
		minWidth: '0',
		rowGap: '4',
	})
}
