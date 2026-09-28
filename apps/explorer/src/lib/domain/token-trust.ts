import type { Address } from 'ox'
import type { RoleHolder } from '#routes/api/tip20-roles'

export type TransferPolicy = {
	id: string
	type:
		| 'allowlist'
		| 'blocklist'
		| 'compound'
		| 'always-allow'
		| 'always-reject'
	admin: Address.Address | null
}

export type TokenPolicy = {
	policy: TransferPolicy
	components: Array<
		TransferPolicy & { scope: 'Sender' | 'Recipient' | 'Mint recipient' }
	>
	paused: boolean | null
	blockNumber: string
	checks: Array<{
		scope: 'Sender' | 'Recipient' | 'Mint recipient'
		policyId: string
		allowed: boolean | null
	}> | null
}

export const policyDescriptions = {
	'always-allow': 'All accounts are permitted.',
	'always-reject': 'All accounts are blocked.',
	allowlist: 'Only listed accounts are permitted.',
	blocklist: 'Listed accounts are blocked.',
	compound: 'Separate policies govern sending, receiving, and receiving mints.',
} satisfies Record<TransferPolicy['type'], string>

export function pauseStatusLabel(paused: boolean | null | undefined): string {
	if (paused === true) return 'Paused'
	if (paused === false) return 'Not paused'
	return 'Status unavailable'
}

const rolePermissions = new Map([
	[
		'DEFAULT_ADMIN',
		[
			[
				'Can replace policy',
				'Sets the TIP-403 transfer policy used by this token.',
			],
			['Manage roles', 'Can manage token roles and their administrators.'],
			['Change supply cap', 'Can change the maximum token supply.'],
		],
	],
	['PAUSE', [['Pause', 'Can pause token transfers.']]],
	['UNPAUSE', [['Unpause', 'Can unpause token transfers.']]],
	['ISSUER', [['Mint', 'Can mint new tokens.']]],
	[
		'BURN_BLOCKED',
		[['Burn blocked tokens', 'Can burn tokens from blocked accounts.']],
	],
])

export function groupTokenAuthorities(
	roles: RoleHolder[],
	policy?: TokenPolicy,
) {
	const groups = new Map<
		string,
		{
			account: Address.Address
			permissions: Array<{
				label: string
				description: string
				policyId?: string
			}>
			roles: RoleHolder[]
		}
	>()
	function group(account: string) {
		const key = account.toLowerCase()
		let value = groups.get(key)
		if (!value) {
			value = {
				account: account as Address.Address,
				permissions: [],
				roles: [],
			}
			groups.set(key, value)
		}
		return value
	}
	for (const role of roles) {
		const value = group(role.account)
		if (value.roles.some((r) => r.roleHash === role.roleHash)) continue
		value.roles.push(role)
		for (const [label, description] of rolePermissions.get(role.role) ?? [
			[role.role, 'Custom token role.'],
		]) {
			value.permissions.push({
				label,
				description: `${description} (${role.role})`,
			})
		}
	}
	if (policy) {
		const policies =
			policy.policy.type === 'compound'
				? policy.components
				: [{ ...policy.policy, scope: undefined }]
		for (const item of policies) {
			if (!item.admin) continue
			const permission =
				item.type === 'allowlist'
					? 'Manage allowed accounts'
					: 'Block / unblock'
			group(item.admin).permissions.push({
				label: item.scope
					? `${permission} · ${item.scope.toLowerCase()}`
					: permission,
				description: `Policy admin: can update the ${item.type} and transfer its administration.`,
				policyId: item.id,
			})
		}
	}
	return [...groups.values()]
}

export function policyLabel(policy: TransferPolicy) {
	return {
		allowlist: 'Allowlist',
		blocklist: 'Blocklist',
		compound: 'Compound',
		'always-allow': 'Always allow',
		'always-reject': 'Always reject',
	}[policy.type]
}

export function tokenRoleDescription(role: string): string {
	return (
		rolePermissions
			.get(role)
			?.map(([, description]) => description)
			.join(' ') ??
		'Custom token role. Permissions are not known to the explorer.'
	)
}

/** Use the same policy rows before and after checking an address. */
export function tokenPolicyRows(policy: TokenPolicy) {
	const scopes = ['Sender', 'Recipient', 'Mint recipient'] as const
	const labels = {
		Sender: 'Send',
		Recipient: 'Receive',
		'Mint recipient': 'Receive mints',
	}
	return scopes.map((scope) => {
		const component =
			policy.components.find((item) => item.scope === scope) ?? policy.policy
		const check = policy.checks?.find(
			(item) => item.scope === scope && item.policyId === component.id,
		)
		return {
			scope,
			label: labels[scope],
			policy: component,
			allowed: check?.allowed ?? null,
		}
	})
}
