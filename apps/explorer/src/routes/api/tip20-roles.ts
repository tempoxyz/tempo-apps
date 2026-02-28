import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import { formatUnits } from 'viem'
import { Abis } from 'viem/tempo'
import { getChainId, readContracts } from 'wagmi/actions'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const ROLE_MEMBERSHIP_UPDATED_SELECTOR_SIGNATURE =
	'RoleMembershipUpdated(bytes32,address,address,bool)'
const ROLE_LOG_SCAN_LIMIT = 10_000

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

function parseTimestamp(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string') {
		const parsed = Number(value)
		if (Number.isFinite(parsed)) return parsed
		const parsedDate = Date.parse(value)
		if (Number.isFinite(parsedDate)) return Math.floor(parsedDate / 1000)
	}
	return null
}

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

					const roles: RoleHolder[] = []
					try {
						const selector = Hash.keccak256(
							Hex.fromString(ROLE_MEMBERSHIP_UPDATED_SELECTOR_SIGNATURE),
						)

						const roleLogs = await tempoQueryBuilder(chainId)
							.selectFrom('logs')
							.select([
								'topic0',
								'topic1',
								'topic2',
								'data',
								'block_timestamp',
								'tx_hash',
								'block_num',
								'log_idx',
							])
							.where('address', '=', address)
							.orderBy('block_num', 'asc')
							.orderBy('log_idx', 'asc')
							.limit(ROLE_LOG_SCAN_LIMIT)
							.execute()

						const holders = new Map<string, boolean>()
						const grantMeta = new Map<
							string,
							{ timestamp: number | null; txHash: string | null }
						>()

						for (const event of roleLogs) {
							if (event.topic0 !== selector) continue
							if (!event.topic1 || !event.topic2 || !event.data) continue

							const roleHash = event.topic1.toLowerCase()
							const accountHex = `0x${event.topic2.slice(-40)}`
							const account = Address.checksum(accountHex as Address.Address)
							const hasRole = (() => {
								try {
									return Hex.toBigInt(event.data) !== 0n
								} catch {
									return false
								}
							})()

							const key = `${roleHash}:${account.toLowerCase()}`
							holders.set(key, hasRole)

							if (hasRole) {
								grantMeta.set(key, {
									timestamp: parseTimestamp(event.block_timestamp),
									txHash: event.tx_hash ?? null,
								})
							}
						}

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
					} catch (error) {
						console.error('[tip20-roles] failed to fetch role logs:', error)
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
