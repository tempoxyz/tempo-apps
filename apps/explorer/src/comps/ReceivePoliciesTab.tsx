import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import * as React from 'react'
import { type Abi, type Address as ViemAddress, formatUnits } from 'viem'
import { usePublicClient } from 'wagmi'
import { Addresses } from 'viem/tempo'
import { AddressCell } from '#comps/AddressCell'
import { cx } from '#lib/css'
import ShieldCheckIcon from '~icons/lucide/shield-check'
import ShieldAlertIcon from '~icons/lucide/shield-alert'
import FilterIcon from '~icons/lucide/filter'
import UserCheckIcon from '~icons/lucide/user-check'
import KeyRoundIcon from '~icons/lucide/key-round'

/**
 * Minimal ABI fragment for the TIP-403 `receivePolicy` view function
 * introduced by TIP-1028. This will move to `viem/tempo` Abis once
 * the SDK is updated.
 */
const receivePolicyAbi = [
	{
		type: 'function',
		name: 'receivePolicy',
		stateMutability: 'view',
		inputs: [{ name: 'account', type: 'address' }],
		outputs: [
			{ name: 'hasReceivePolicy', type: 'bool' },
			{ name: 'senderPolicyId', type: 'uint64' },
			{ name: 'senderPolicyType', type: 'uint8' },
			{ name: 'tokenFilterId', type: 'uint64' },
			{ name: 'tokenFilterType', type: 'uint8' },
			{ name: 'recoveryAuthority', type: 'address' },
		],
	},
	{
		type: 'function',
		name: 'policyMembers',
		stateMutability: 'view',
		inputs: [
			{ name: 'policyId', type: 'uint64' },
			{ name: 'offset', type: 'uint256' },
			{ name: 'limit', type: 'uint256' },
		],
		outputs: [
			{ name: 'members', type: 'address[]' },
			{ name: 'total', type: 'uint256' },
		],
	},
] as const satisfies Abi

const ESCROW_ADDRESS = '0xE5C0000000000000000000000000000000000000'

type PolicyType = 'none' | 'whitelist' | 'blacklist' | 'unknown'

function decodePolicyType(raw: number): PolicyType {
	switch (raw) {
		case 0:
			return 'none'
		case 1:
			return 'whitelist'
		case 2:
			return 'blacklist'
		default:
			return 'unknown'
	}
}

function formatRecoveryAuthority(address: ViemAddress): string {
	if (address === '0x0000000000000000000000000000000000000000')
		return 'Receiver (self)'
	if (address === '0x0000000000000000000000000000000000000001')
		return 'Originator (sender)'
	return address
}

type ReceivePolicyData = {
	hasReceivePolicy: boolean
	senderPolicyId: bigint
	senderPolicyType: PolicyType
	tokenFilterId: bigint
	tokenFilterType: PolicyType
	recoveryAuthority: ViemAddress
}

type PolicyMembers = {
	members: ViemAddress[]
	total: bigint
}

function useReceivePolicy(address: Address.Address) {
	const publicClient = usePublicClient()
	return useQuery({
		queryKey: ['receive-policy', address],
		queryFn: async (): Promise<ReceivePolicyData | null> => {
			if (!publicClient) return null
			try {
				const result = await publicClient.readContract({
					address: Addresses.tip403Registry as ViemAddress,
					abi: receivePolicyAbi,
					functionName: 'receivePolicy',
					args: [address as ViemAddress],
				})
				return {
					hasReceivePolicy: result[0],
					senderPolicyId: result[1],
					senderPolicyType: decodePolicyType(result[2]),
					tokenFilterId: result[3],
					tokenFilterType: decodePolicyType(result[4]),
					recoveryAuthority: result[5],
				}
			} catch {
				return null
			}
		},
		enabled: !!publicClient,
		staleTime: 30_000,
	})
}

function usePolicyMembers(policyId: bigint | undefined, enabled: boolean) {
	const publicClient = usePublicClient()
	return useQuery({
		queryKey: ['policy-members', policyId?.toString()],
		queryFn: async (): Promise<PolicyMembers | null> => {
			if (!publicClient || policyId === undefined) return null
			try {
				const result = await publicClient.readContract({
					address: Addresses.tip403Registry as ViemAddress,
					abi: receivePolicyAbi,
					functionName: 'policyMembers',
					args: [policyId, 0n, 50n],
				})
				return { members: result[0] as ViemAddress[], total: result[1] }
			} catch {
				return null
			}
		},
		enabled: enabled && !!publicClient && policyId !== undefined,
		staleTime: 30_000,
	})
}

export function ReceivePoliciesTab(props: {
	address: Address.Address
}): React.JSX.Element {
	const { address } = props
	const { data: policy, isLoading } = useReceivePolicy(address)

	const showSenderMembers =
		policy?.hasReceivePolicy &&
		policy.senderPolicyId > 1n &&
		(policy.senderPolicyType === 'whitelist' ||
			policy.senderPolicyType === 'blacklist')

	const showTokenMembers =
		policy?.hasReceivePolicy &&
		policy.tokenFilterId > 1n &&
		(policy.tokenFilterType === 'whitelist' ||
			policy.tokenFilterType === 'blacklist')

	const { data: senderMembers } = usePolicyMembers(
		policy?.senderPolicyId,
		!!showSenderMembers,
	)

	const { data: tokenMembers } = usePolicyMembers(
		policy?.tokenFilterId,
		!!showTokenMembers,
	)

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-16 text-tertiary text-[13px]">
				Loading receive policy…
			</div>
		)
	}

	if (!policy || !policy.hasReceivePolicy) {
		return (
			<div className="flex flex-col items-center justify-center py-16 gap-3">
				<ShieldCheckIcon className="size-8 text-tertiary" />
				<p className="text-[13px] text-tertiary">
					No receive policy configured — all inbound transfers are accepted.
				</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col divide-y divide-card-border">
			{/* Overview */}
			<div className="px-[18px] py-[16px] flex flex-col gap-[14px]">
				<div className="flex items-center gap-[8px]">
					<ShieldAlertIcon className="size-4 text-accent" />
					<span className="text-[13px] font-medium text-primary">
						Receive Policy Active
					</span>
				</div>
				<p className="text-[12px] text-secondary leading-[18px]">
					This address filters inbound TIP-20 transfers and mints. Blocked funds
					are sent to escrow at{' '}
					<Link
						to="/address/$address"
						params={{ address: ESCROW_ADDRESS }}
						className="text-accent font-mono"
					>
						{ESCROW_ADDRESS.slice(0, 10)}…
					</Link>{' '}
					and can be claimed later.
				</p>
			</div>

			{/* Recovery Authority */}
			<PolicySection
				icon={<KeyRoundIcon className="size-3.5" />}
				title="Recovery Authority"
				description="Who can claim blocked receipts for this address."
			>
				<div className="text-[13px] text-primary font-mono break-all">
					{formatRecoveryAuthority(policy.recoveryAuthority) ===
					policy.recoveryAuthority ? (
						<AddressCell address={policy.recoveryAuthority} />
					) : (
						<span className="font-sans">
							{formatRecoveryAuthority(policy.recoveryAuthority)}
						</span>
					)}
				</div>
			</PolicySection>

			{/* Sender Policy */}
			<PolicySection
				icon={<UserCheckIcon className="size-3.5" />}
				title="Sender Policy"
				description="Controls which senders are allowed to transfer to this address."
			>
				<PolicyBadge
					policyId={policy.senderPolicyId}
					policyType={policy.senderPolicyType}
					label="senders"
				/>
				{senderMembers && senderMembers.members.length > 0 && (
					<MembersList
						members={senderMembers.members}
						total={senderMembers.total}
						label={
							policy.senderPolicyType === 'whitelist'
								? 'Allowed senders'
								: 'Blocked senders'
						}
					/>
				)}
			</PolicySection>

			{/* Token Filter */}
			<PolicySection
				icon={<FilterIcon className="size-3.5" />}
				title="Token Filter"
				description="Controls which TIP-20 tokens this address accepts."
			>
				<PolicyBadge
					policyId={policy.tokenFilterId}
					policyType={policy.tokenFilterType}
					label="tokens"
				/>
				{tokenMembers && tokenMembers.members.length > 0 && (
					<MembersList
						members={tokenMembers.members}
						total={tokenMembers.total}
						label={
							policy.tokenFilterType === 'whitelist'
								? 'Allowed tokens'
								: 'Blocked tokens'
						}
					/>
				)}
			</PolicySection>
		</div>
	)
}

function PolicySection(props: {
	icon: React.ReactNode
	title: string
	description: string
	children: React.ReactNode
}) {
	return (
		<div className="px-[18px] py-[14px] flex flex-col gap-[10px]">
			<div className="flex items-center gap-[6px]">
				<span className="text-secondary">{props.icon}</span>
				<span className="text-[13px] font-medium text-primary">
					{props.title}
				</span>
			</div>
			<p className="text-[12px] text-tertiary">{props.description}</p>
			{props.children}
		</div>
	)
}

function PolicyBadge(props: {
	policyId: bigint
	policyType: PolicyType
	label: string
}) {
	const { policyId, policyType, label } = props

	if (policyId === 0n) {
		return (
			<span className="inline-flex items-center gap-1.5 text-[12px] text-red-400 bg-red-400/10 rounded-full px-2.5 py-1 w-fit">
				<span className="size-1.5 rounded-full bg-red-400" />
				Reject all {label}
			</span>
		)
	}

	if (policyId === 1n) {
		return (
			<span className="inline-flex items-center gap-1.5 text-[12px] text-green-400 bg-green-400/10 rounded-full px-2.5 py-1 w-fit">
				<span className="size-1.5 rounded-full bg-green-400" />
				Allow all {label}
			</span>
		)
	}

	const typeLabel =
		policyType === 'whitelist'
			? 'Allowlist'
			: policyType === 'blacklist'
				? 'Blocklist'
				: 'Custom'

	const color =
		policyType === 'whitelist'
			? 'text-blue-400 bg-blue-400/10'
			: 'text-orange-400 bg-orange-400/10'

	const dotColor =
		policyType === 'whitelist' ? 'bg-blue-400' : 'bg-orange-400'

	return (
		<span
			className={cx(
				'inline-flex items-center gap-1.5 text-[12px] rounded-full px-2.5 py-1 w-fit',
				color,
			)}
		>
			<span className={cx('size-1.5 rounded-full', dotColor)} />
			{typeLabel} (Policy #{policyId.toString()})
		</span>
	)
}

function MembersList(props: {
	members: ViemAddress[]
	total: bigint
	label: string
}) {
	const { members, total, label } = props
	const [expanded, setExpanded] = React.useState(false)
	const displayMembers = expanded ? members : members.slice(0, 5)

	return (
		<div className="flex flex-col gap-[6px] mt-[4px]">
			<span className="text-[11px] text-tertiary uppercase tracking-wider">
				{label} ({total.toString()})
			</span>
			<div className="flex flex-col gap-[2px]">
				{displayMembers.map((member) => (
					<div
						key={member}
						className="flex items-center gap-[8px] py-[4px] text-[13px]"
					>
						<AddressCell address={member} />
					</div>
				))}
			</div>
			{members.length > 5 && !expanded && (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					className="text-[12px] text-accent hover:underline cursor-pointer w-fit"
				>
					Show all {total.toString()}
				</button>
			)}
		</div>
	)
}

export declare namespace ReceivePoliciesTab {
	type Props = {
		address: Address.Address
	}
}
