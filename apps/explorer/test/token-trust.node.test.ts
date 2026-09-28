import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	groupTokenAuthorities,
	type TokenPolicy,
} from '#lib/domain/token-trust'
import type { RoleHolder } from '#routes/api/tip20-roles'
import { readTokenPolicy } from '#lib/server/token-trust'

const { readContract, readContracts, getBlockNumber } = vi.hoisted(() => ({
	readContract: vi.fn(),
	readContracts: vi.fn(),
	getBlockNumber: vi.fn(),
}))
vi.mock('wagmi/actions', () => ({
	readContract,
	readContracts,
	getBlockNumber,
	getChainId: () => 4217,
}))
vi.mock('#wagmi.config', () => ({ getWagmiConfig: () => ({}) }))

const token = '0x20c0000000000000000000000000000000000000'
const admin = '0x00000000000000000000000000000000000000ab'
const other = '0x00000000000000000000000000000000000000cd'
const zero = '0x0000000000000000000000000000000000000000'
const input = { token, chainId: 4217 } as const

function role(name: string, account = admin): RoleHolder {
	return {
		role: name,
		roleHash: name,
		account,
		grantedAt: null,
		grantedTx: null,
	}
}
const policy: TokenPolicy = {
	policy: { id: '42', type: 'blocklist', admin },
	components: [],
	paused: false,
	blockNumber: '100',
	checks: null,
}

describe('token authority grouping', () => {
	it('merges case variants and policy control into one account, preserving each role', () => {
		const groups = groupTokenAuthorities(
			[role('PAUSE'), role('UNPAUSE', admin.toUpperCase()), role('PAUSE')],
			policy,
		)
		expect(groups).toHaveLength(1)
		expect(groups[0].roles.map((r) => r.role)).toEqual(['PAUSE', 'UNPAUSE'])
		expect(groups[0].permissions.map((p) => p.label)).toEqual([
			'Pause',
			'Unpause',
			'Block / unblock',
		])
	})
	it('keeps multiple holders and unknown roles without inventing permissions', () => {
		const groups = groupTokenAuthorities([
			role('ISSUER'),
			role('ISSUER', other),
			role('0xcustom', other),
		])
		expect(groups).toHaveLength(2)
		expect(groups[1].permissions.map((p) => p.label)).toEqual([
			'Mint',
			'0xcustom',
		])
	})
	it('makes token policy replacement distinct from policy list administration', () => {
		const groups = groupTokenAuthorities([role('DEFAULT_ADMIN', other)], policy)
		expect(groups[0].permissions.map((p) => p.label)).toEqual([
			'Can replace policy',
			'Manage roles',
			'Change supply cap',
		])
		expect(groups[1].permissions[0]).toMatchObject({
			label: 'Block / unblock',
			policyId: '42',
		})
	})
	it('retains each compound scope and excludes built-in policy administrators', () => {
		const groups = groupTokenAuthorities([], {
			...policy,
			policy: { id: '45', type: 'compound', admin: null },
			components: [
				{ id: '1', type: 'always-allow', admin: null, scope: 'Sender' },
				{ id: '42', type: 'blocklist', admin, scope: 'Recipient' },
				{ id: '43', type: 'allowlist', admin, scope: 'Mint recipient' },
			],
		})
		expect(groups).toHaveLength(1)
		expect(groups[0].permissions.map((p) => p.label)).toEqual([
			'Block / unblock · recipient',
			'Manage allowed accounts · mint recipient',
		])
	})
})

describe('token policy reads', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		getBlockNumber.mockResolvedValue(100n)
		readContract.mockImplementation(async (_config, request) => {
			if (request.functionName === 'transferPolicyId') return 42n
			if (request.functionName === 'policyData') return [1, admin]
			throw new Error('Unexpected contract read')
		})
		readContracts.mockImplementation(async (_config, request) =>
			request.contracts.map((c: { functionName: string }) => ({
				status: 'success',
				result: c.functionName !== 'paused',
			})),
		)
	})
	it('pins policy, pause status, and checks to the same block', async () => {
		const result = await readTokenPolicy({ ...input, account: other })
		expect(result).toMatchObject({
			policy: policy.policy,
			components: [],
			paused: false,
			blockNumber: '100',
		})
		expect(result.checks).toEqual(
			['Sender', 'Recipient', 'Mint recipient'].map((scope) => ({
				scope,
				policyId: '42',
				allowed: true,
			})),
		)
		for (const [, request] of [
			...readContract.mock.calls,
			...readContracts.mock.calls,
		])
			expect(request.blockNumber).toBe(100n)
	})
	it.each([
		0n,
		1n,
	])('recognizes built-in policy %s without a list admin', async (id) => {
		readContract.mockResolvedValue(id)
		const result = await readTokenPolicy(input)
		expect(result.policy).toEqual({
			id: String(id),
			type: id === 0n ? 'always-reject' : 'always-allow',
			admin: null,
		})
		expect(readContract).toHaveBeenCalledTimes(1)
		expect(result.checks).toBeNull()
	})
	it('uses the separate component policies for asymmetric authorization', async () => {
		readContract.mockImplementation(async (_config, request) => {
			if (request.functionName === 'transferPolicyId') return 45n
			if (request.functionName === 'compoundPolicyData') return [1n, 42n, 43n]
			return request.args[0] === 45n
				? [2, zero]
				: request.args[0] === 42n
					? [1, admin]
					: [0, other]
		})
		readContracts
			.mockResolvedValueOnce([{ status: 'success', result: true }])
			.mockResolvedValueOnce([
				{ status: 'success', result: true },
				{ status: 'success', result: false },
				{ status: 'failure', error: new Error('RPC failure') },
			])
		const result = await readTokenPolicy({ ...input, account: other })
		expect(result.policy.admin).toBeNull()
		expect(result.components.map((p) => [p.scope, p.admin])).toEqual([
			['Sender', null],
			['Recipient', admin],
			['Mint recipient', other],
		])
		expect(result.checks?.map((c) => [c.policyId, c.allowed])).toEqual([
			['1', true],
			['42', false],
			['43', null],
		])
		expect(
			readContracts.mock.calls[1][1].contracts.map(
				(c: { args: unknown[] }) => c.args,
			),
		).toEqual([
			[1n, other],
			[42n, other],
			[43n, other],
		])
		expect(result.paused).toBe(true)
	})
	it('does not describe an unreadable policy as unrestricted', async () => {
		readContract.mockRejectedValue(new Error('RPC unavailable'))
		await expect(readTokenPolicy(input)).rejects.toThrow('RPC unavailable')
	})
	it('does not mistake missing pause status for unpaused', async () => {
		readContracts.mockResolvedValue([{ status: 'failure' }])
		expect((await readTokenPolicy(input)).paused).toBeNull()
	})
	it('rejects a different chain before issuing reads', async () => {
		await expect(readTokenPolicy({ ...input, chainId: 42431 })).rejects.toThrow(
			'Token policy chain mismatch',
		)
		expect(getBlockNumber).not.toHaveBeenCalled()
	})
	it('does not assign policy control to the zero address', async () => {
		readContract.mockResolvedValueOnce(42n).mockResolvedValueOnce([1, zero])
		expect((await readTokenPolicy(input)).policy.admin).toBeNull()
	})
})
