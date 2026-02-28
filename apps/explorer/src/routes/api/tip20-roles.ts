import { createFileRoute } from '@tanstack/react-router'
import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import { formatUnits } from 'viem'
import { Abis } from 'viem/tempo'
import { getChainId, readContracts } from 'wagmi/actions'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const ROLE_MEMBERSHIP_UPDATED_SIGNATURE =
	'event RoleMembershipUpdated(bytes32 indexed role, address indexed account, address indexed sender, bool hasRole)'

const ZERO_BYTES32 =
	'0x0000000000000000000000000000000000000000000000000000000000000000' as Hex.Hex

const KNOWN_ROLES: Record<string, Hex.Hex> = {
	DEFAULT_ADMIN_ROLE: ZERO_BYTES32,
	PAUSE_ROLE: Hash.keccak256(Hex.fromString('PAUSE_ROLE')),
	UNPAUSE_ROLE: Hash.keccak256(Hex.fromString('UNPAUSE_ROLE')),
	ISSUER_ROLE: Hash.keccak256(Hex.fromString('ISSUER_ROLE')),
	BURN_BLOCKED_ROLE: Hash.keccak256(Hex.fromString('BURN_BLOCKED_ROLE')),
}

const ROLE_HASH_TO_NAME = new Map<string, string>(
	Object.entries(KNOWN_ROLES).map(([name, hash]) => [hash, name]),
)

export type RoleHolder = {
	role: string
	roleHash: string
	account: string
	grantedAt: number | null
	grantedTx: string | null
}

export type Tip20Config = {
	supplyCap: string | null
	currency: string | null
	transferPolicyId: string | null
	paused: boolean | null
	decimals: number | null
	symbol: string | null
}

export type Tip20RolesResponse = { roles: RoleHolder[]; config: Tip20Config }

export const Route = createFileRoute('/api/tip20-roles')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const address = zAddress().parse(url.searchParams.get('address'))
					const chainIdParam = url.searchParams.get('chainId')
					const config = getWagmiConfig()
					const chainId = chainIdParam
						? Number(chainIdParam)
						: getChainId(config)

					// Fetch TIP-20 config via server-side RPC (authenticated)
					const contractResults = await readContracts(config, {
						contracts: [
							{ address, abi: Abis.tip20, functionName: 'supplyCap' },
							{ address, abi: Abis.tip20, functionName: 'currency' },
							{ address, abi: Abis.tip20, functionName: 'transferPolicyId' },
							{ address, abi: Abis.tip20, functionName: 'paused' },
							{ address, abi: Abis.tip20, functionName: 'decimals' },
							{ address, abi: Abis.tip20, functionName: 'symbol' },
						],
					})

					const supplyCap = contractResults[0].result as bigint | undefined
					const currency = contractResults[1].result as string | undefined
					const transferPolicyId = contractResults[2].result as
						| bigint
						| undefined
					const paused = contractResults[3].result as boolean | undefined
					const decimals = contractResults[4].result as number | undefined
					const symbol = contractResults[5].result as string | undefined

					const MAX_UINT128 = 2n ** 128n - 1n
					const tip20Config: Tip20Config = {
						supplyCap:
							supplyCap !== undefined && decimals !== undefined && symbol
								? supplyCap >= MAX_UINT128
									? 'Unlimited'
									: `${Number(formatUnits(supplyCap, decimals)).toLocaleString()} ${symbol}`
								: null,
						currency: currency ?? null,
						transferPolicyId:
							transferPolicyId !== undefined
								? transferPolicyId === 0n
									? '0 (none)'
									: String(transferPolicyId)
								: null,
						paused: paused ?? null,
						decimals: decimals ?? null,
						symbol: symbol ?? null,
					}

					const qb = tempoQueryBuilder(chainId).withSignatures([
						ROLE_MEMBERSHIP_UPDATED_SIGNATURE,
					])

					const events = await qb
						.selectFrom('rolemembershipupdated')
						.select([
							'role',
							'account',
							'hasRole',
							'block_num',
							'log_idx',
							'block_timestamp',
							'tx_hash',
						])
						.where('address', '=', address)
						.orderBy('block_num', 'asc')
						.orderBy('log_idx', 'asc')
						.execute()

					// Build current role holders by replaying grant/revoke events
					// Key: `${role}:${account}`
					const holders = new Map<string, boolean>()
					const grantMeta = new Map<
						string,
						{ timestamp: number | null; txHash: string | null }
					>()
					for (const event of events) {
						const key = `${event.role}:${event.account}`
						holders.set(key, Boolean(event.hasRole))
						if (event.hasRole) {
							grantMeta.set(key, {
								timestamp: event.block_timestamp
									? Number(event.block_timestamp)
									: null,
								txHash: event.tx_hash ?? null,
							})
						}
					}

					const roles: RoleHolder[] = []
					for (const [key, hasRole] of holders) {
						if (!hasRole) continue
						const [roleHash, account] = key.split(':')
						const rawName = ROLE_HASH_TO_NAME.get(roleHash) ?? roleHash
						const roleName = rawName.endsWith('_ROLE')
							? rawName.slice(0, -5)
							: rawName
						const meta = grantMeta.get(key)
						roles.push({
							role: roleName,
							roleHash,
							account,
							grantedAt: meta?.timestamp ?? null,
							grantedTx: meta?.txHash ?? null,
						})
					}

					return Response.json(
						{ roles, config: tip20Config } satisfies Tip20RolesResponse,
						{
							headers: {
								'Cache-Control': 'public, max-age=300',
							},
						},
					)
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					return Response.json(
						{ data: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
