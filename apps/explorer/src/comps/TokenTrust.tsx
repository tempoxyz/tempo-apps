import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	Alert,
	Button,
	Field,
	ListGroup,
	LoadingDots,
	Skeleton,
	StatusChip,
	style,
	TextInput,
} from '@tempoxyz/ds'
import * as Address from 'ox/Address'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { cx } from 'zyzz'
import { Address as AddressLink } from '#comps/Address'
import { ContractSection } from '#comps/Contract'
import { ListGroupLoader } from '#comps/ListGroupLoader'
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
						<ListGroup>
							<ListGroup.Row>
								<ListGroup.Label>Policy</ListGroup.Label>
								{policy ? (
									<PolicyLink policy={policy.policy} />
								) : (
									<Skeleton shape="pill" {...styles.skeleton()} />
								)}
							</ListGroup.Row>
							<ListGroup.Row>
								<ListGroup.Label>Transfers</ListGroup.Label>
								{policy ? (
									<StatusChip
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
										{policy.paused === true
											? 'Paused'
											: policy.paused === false
												? 'Active'
												: 'Unavailable'}
									</StatusChip>
								) : (
									<Skeleton shape="pill" {...styles.skeleton()} />
								)}
							</ListGroup.Row>
						</ListGroup>
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
					<ListGroupLoader label="Loading token roles" />
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
						<ListGroup>
							{group.roles.map((role) => (
								<ListGroup.Row key={role.roleHash}>
									<ListGroup.Info>
										<ListGroup.Title>
											<span {...styles.roleName()}>{role.role}</span>
										</ListGroup.Title>
										<ListGroup.Description>
											{tokenRoleDescription(role.role)}
										</ListGroup.Description>
									</ListGroup.Info>
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
								</ListGroup.Row>
							))}
							{group.permissions.map(
								(permission, index) =>
									permission.policyId !== undefined && (
										<ListGroup.Row key={`${permission.policyId}:${index}`}>
											<ListGroup.Info>
												<ListGroup.Title>{permission.label}</ListGroup.Title>
												<ListGroup.Description>
													{permission.description}
												</ListGroup.Description>
											</ListGroup.Info>
											<span {...styles.grant()}>
												<Link
													to="/policy/$id"
													params={{ id: permission.policyId }}
													{...cx(link(), linkHover())}
												>
													Policy #{permission.policyId} activity
												</Link>
											</span>
										</ListGroup.Row>
									),
							)}
						</ListGroup>
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
		<Alert intent="negative" role="status">
			<Alert.Icon />
			<Alert.Content>{props.message}</Alert.Content>
			<Alert.Action onClick={props.onRetry}>Try again</Alert.Action>
		</Alert>
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
						<TextInput.Group {...styles.input()}>
							<TextInput.Control
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
						</TextInput.Group>
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
				<ListGroup aria-label="Policy permissions" role="group">
					{tokenPolicyRows(result).map((row) => (
						<ListGroup.Row key={row.scope}>
							<ListGroup.Label>{row.label}</ListGroup.Label>
							<span {...styles.resultValue()}>
								{result.components.length > 0 && (
									<PolicyLink policy={row.policy} />
								)}
								{result.checks && (
									<StatusChip
										intent={
											row.allowed === null
												? 'neutral'
												: row.allowed
													? 'positive'
													: 'negative'
										}
										size="small"
									>
										{row.allowed === null
											? 'Unavailable'
											: row.allowed
												? 'Permitted by policy'
												: 'Blocked by policy'}
									</StatusChip>
								)}
							</span>
						</ListGroup.Row>
					))}
				</ListGroup>
			)}
			{result.checks && (
				<p {...styles.secondary()}>Checked at block {result.blockNumber}.</p>
			)}
		</div>
	)
}

namespace styles {
	export const skeleton = style({ height: '12', width: '6rem !custom' })

	export const secondary = style({ color: 'content.secondary' })

	export const description = style({
		color: 'content.secondary',
		typography: 'body.b3',
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
		typography: 'mono.m1',
	})

	export const grant = style({
		alignItems: 'flex-end',
		color: 'content.secondary',
		display: 'flex',
		flexDirection: 'column',
		flexShrink: 0,
		gap: '4',
		typography: 'body.b3',
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
