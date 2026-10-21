import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	Button,
	Callout,
	Field,
	Input,
	LoadingDots,
	Rows,
	Skeleton,
	Tag,
	style,
} from '@tempoxyz/ds'
import * as Address from 'ox/Address'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { cx } from 'zyzz'
import { Address as AddressLink } from '#comps/Address'
import { ContractSection } from '#comps/Contract'
import {
	groupTokenAuthorities,
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

/** The token's transfer policy and privileged addresses, as two sections. */
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
		<>
			<ContractSection
				title="Transfer policy"
				description="Who may send, receive and mint this token. Token admins can replace the policy."
			>
				{policyQuery.isError ? (
					<Unavailable
						message="Transfer policy unavailable."
						onRetry={() => void policyQuery.refetch()}
					/>
				) : (
					<>
						<Rows dividers="full">
							<Rows.Row spacing="none">
								<Rows.Label>Policy</Rows.Label>
								{policy ? (
									<PolicyLink policy={policy.policy} />
								) : (
									<Skeleton shape="pill" {...styles.skeleton()} />
								)}
							</Rows.Row>
							<Rows.Row spacing="none">
								<Rows.Label>Transfers</Rows.Label>
								{policy ? (
									<Tag
										role="status"
										aria-label="Token pause status"
										intent={
											policy.paused === true
												? 'warning'
												: policy.paused === false
													? 'positive'
													: 'neutral'
										}
										size="small"
									>
										<Tag.Dot />
										{policy.paused === true
											? 'Paused'
											: policy.paused === false
												? 'Active'
												: 'Unavailable'}
									</Tag>
								) : (
									<Skeleton shape="pill" {...styles.skeleton()} />
								)}
							</Rows.Row>
						</Rows>
						{policy && (
							<p {...styles.description()}>
								{policyDescriptions[policy.policy.type]}
								{policy.paused === false &&
									' Transfers aren’t paused, but the policy still applies.'}
							</p>
						)}
					</>
				)}
				<AddressPolicyChecker
					key={`${chainId}:${props.address}`}
					address={props.address}
					chainId={chainId}
					policy={policy}
				/>
			</ContractSection>
			<ContractSection
				title="Privileged addresses"
				description="Accounts that hold a token role or manage one of its policies."
			>
				{props.loading ? (
					<Rows dividers="full">
						<Rows.RowGroupLoader aria-label="Loading token roles" />
					</Rows>
				) : props.unavailable ? (
					<Unavailable
						message="Token roles unavailable. Policy permissions below may still be shown."
						onRetry={props.onRetry}
					/>
				) : (
					props.roles.length === 0 && (
						<p {...styles.description()}>
							No current token role holders found.
						</p>
					)
				)}
				{groups.map((group) => (
					<div key={group.account} {...styles.account()}>
						<h4 {...styles.accountTitle()}>
							<AddressLink address={group.account} />
						</h4>
						<Rows dividers="full">
							{group.roles.map((role) => (
								<Rows.Row key={role.roleHash} spacing="none">
									<Rows.Info>
										<Rows.Title>
											<span {...styles.roleName()}>{role.role}</span>
										</Rows.Title>
										<Rows.Description>
											{tokenRoleDescription(role.role)}
										</Rows.Description>
									</Rows.Info>
									<span {...styles.grant()}>
										{role.grantedAt != null && (
											<time
												dateTime={new Date(role.grantedAt * 1000).toISOString()}
											>
												{new Date(role.grantedAt * 1000).toLocaleDateString(
													'en-US',
													{ day: 'numeric', month: 'short', year: 'numeric' },
												)}
											</time>
										)}
										{role.grantedTx ? (
											<Link
												to="/tx/$hash"
												params={{ hash: role.grantedTx as `0x${string}` }}
												{...cx(link(), linkHover())}
												aria-label={`View ${role.role} grant transaction for ${group.account}`}
											>
												View grant
											</Link>
										) : (
											<span>Grant unavailable</span>
										)}
									</span>
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
													{permission.description}
												</Rows.Description>
											</Rows.Info>
											<span {...styles.grant()}>
												<Link
													to="/policy/$id"
													params={{ id: permission.policyId }}
													{...cx(link(), linkHover())}
												>
													Policy #{permission.policyId} activity
												</Link>
											</span>
										</Rows.Row>
									),
							)}
						</Rows>
					</div>
				))}
			</ContractSection>
		</>
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
			<span {...styles.secondary()}>{policyLabel(policy)}</span>
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
			<form
				noValidate
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
				<Field.Root invalid={invalid}>
					<Field.Label>Address to check</Field.Label>
					<div {...styles.inputRow()}>
						<Input.Group {...styles.input()}>
							<Input.Control
								value={value}
								onValueChange={(next) => {
									setValue(next)
									setAccount(undefined)
									setInvalid(false)
								}}
								placeholder="0x…"
								autoCapitalize="off"
								autoComplete="off"
								autoCorrect="off"
								spellCheck={false}
							/>
						</Input.Group>
						<Button
							type="submit"
							loading={query.isFetching}
							variant="secondary"
						>
							Check address
						</Button>
					</div>
					<Field.Description>
						Checks the policy only, without simulating a transfer.
					</Field.Description>
					<Field.Error match={invalid}>
						Enter an address that starts with 0x and has 40 hex characters.
					</Field.Error>
				</Field.Root>
			</form>
			<div aria-live="polite">
				{account && query.isFetching ? (
					<p {...styles.secondary()}>
						Checking current policy <LoadingDots aria-label="Checking" />
					</p>
				) : account && query.isError ? (
					<Unavailable
						message="Could not check this address."
						onRetry={() => void query.refetch()}
					/>
				) : displayedPolicy ? (
					<PolicyCheckResult result={displayedPolicy} />
				) : null}
			</div>
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
										size="small"
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
	export const skeleton = style({ height: '12', width: '6rem !custom' })

	export const secondary = style({ color: 'gray.900' })

	export const description = style({
		color: 'gray.900',
		typography: 'copy.13',
	})

	export const account = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0',
	})

	// The account heads its rows; Hex sets the type.
	export const accountTitle = style({ display: 'flex', minWidth: '0' })

	export const roleName = style({
		overflowWrap: 'anywhere',
		typography: 'copy.13.mono',
	})

	export const grant = style({
		alignItems: 'flex-end',
		color: 'gray.900',
		display: 'flex',
		flexDirection: 'column',
		flexShrink: 0,
		gap: '4',
		typography: 'copy.13',
	})

	export const policyLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
	})

	export const checker = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		paddingTop: '8',
	})

	export const inputRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
	})

	export const input = style({ flex: 1, minWidth: '0' })

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
