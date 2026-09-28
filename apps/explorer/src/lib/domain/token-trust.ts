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
