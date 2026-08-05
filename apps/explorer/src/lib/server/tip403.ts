import { createServerFn } from '@tanstack/react-start'
import * as Address from 'ox/Address'
import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import { decodeAbiParameters, toHex } from 'viem'
import { Addresses } from 'viem/tempo'
import { getChainId, readContracts } from 'wagmi/actions'
import { Abis } from '#lib/abis'
import {
	parseTip403PolicyType,
	updateTip403Member,
	type Tip403PolicyType,
} from '#lib/domain/tip403'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import {
	dedupePolicyLogs,
	fetchAllPolicyLogPages,
	fetchRecentUniquePolicyLogs,
} from '#lib/server/tip403-log-utils'
import { getWagmiConfig } from '#wagmi.config'
import * as z from 'zod/mini'

const POLICY_LOG_PAGE_SIZE = 10_000
const RECENT_ACTIVITY_LIMIT = 20
const registryAddress =
	Addresses.tip403Registry.toLowerCase() as Address.Address

const eventSelectors = {
	created: Hash.keccak256(
		Hex.fromString('PolicyCreated(uint64,address,uint8)'),
	),
	adminUpdated: Hash.keccak256(
		Hex.fromString('PolicyAdminUpdated(uint64,address,address)'),
	),
	whitelistUpdated: Hash.keccak256(
		Hex.fromString('WhitelistUpdated(uint64,address,address,bool)'),
	),
	blacklistUpdated: Hash.keccak256(
		Hex.fromString('BlacklistUpdated(uint64,address,address,bool)'),
	),
	compoundCreated: Hash.keccak256(
		Hex.fromString(
			'CompoundPolicyCreated(uint64,address,uint64,uint64,uint64)',
		),
	),
} as const

type PolicyType = Tip403PolicyType

export type Tip403PolicyEvent = {
	type:
		| 'created'
		| 'admin updated'
		| 'whitelist updated'
		| 'blacklist updated'
		| 'compound created'
	blockNumber: string
	timestamp: number | null
	txHash: Hex.Hex
	logIndex: string
	updater?: Address.Address
	admin?: Address.Address
	account?: Address.Address
	allowed?: boolean
	componentPolicies?: [string, string, string]
}

export type Tip403PolicyResponse = {
	policyId: string
	type: PolicyType
	admin: Address.Address
	componentPolicies?: [string, string, string]
	members: Address.Address[]
	membersTotal: number
	activity: Tip403PolicyEvent[]
	activityTruncated: boolean
}

type PolicyLog = {
	selector?: string | null
	topic1?: string | null
	topic2?: string | null
	topic3?: string | null
	data?: string | null
	block_num?: unknown
	block_timestamp?: unknown
	tx_hash?: string | null
	log_idx?: unknown
}

type PolicyEventType = Tip403PolicyEvent['type']
type TaggedPolicyLog = PolicyLog & { eventType: PolicyEventType }

function parseTimestamp(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'bigint') return Number(value)
	if (typeof value === 'string') {
		const numeric = Number(value)
		if (Number.isFinite(numeric)) return numeric
		const date = Date.parse(value)
		if (Number.isFinite(date)) return Math.floor(date / 1000)
	}
	return null
}

function parseAddress(
	topic: string | null | undefined,
): Address.Address | undefined {
	if (!topic || topic.length < 40) return undefined
	try {
		return Address.checksum(`0x${topic.slice(-40)}` as Address.Address)
	} catch {
		return undefined
	}
}

function parseBool(data: string | null | undefined): boolean {
	if (!data) return false
	try {
		return Hex.toBigInt(data as Hex.Hex) !== 0n
	} catch {
		return false
	}
}

function sortLogs(logs: TaggedPolicyLog[]): TaggedPolicyLog[] {
	return [...logs].sort((a, b) => {
		const blockA = BigInt(String(a.block_num ?? 0))
		const blockB = BigInt(String(b.block_num ?? 0))
		if (blockA !== blockB) return blockA < blockB ? -1 : 1
		return Number(a.log_idx ?? 0) - Number(b.log_idx ?? 0)
	})
}

function decodeCompoundPolicies(data: string | null | undefined) {
	if (!data) return undefined
	try {
		const [sender, recipient, mintRecipient] = decodeAbiParameters(
			[{ type: 'uint64' }, { type: 'uint64' }, { type: 'uint64' }],
			data as Hex.Hex,
		)
		return [
			sender.toString(),
			recipient.toString(),
			mintRecipient.toString(),
		] as [string, string, string]
	} catch {
		return undefined
	}
}

export const fetchTip403Policy = createServerFn({ method: 'POST' })
	.inputValidator(
		z.object({
			policyId: z.string(),
			page: z.number(),
			limit: z.number(),
			query: z.string(),
		}),
	)
	.handler(async ({ data }): Promise<Tip403PolicyResponse | null> => {
		const policyId = BigInt(data.policyId)
		const policyTopic = toHex(policyId, { size: 32 })
		const config = getWagmiConfig()
		const chainId = getChainId(config)
		const results = await readContracts(config, {
			contracts: [
				{
					address: Addresses.tip403Registry,
					abi: Abis.tip403Registry,
					functionName: 'policyExists',
					args: [policyId],
				},
				{
					address: Addresses.tip403Registry,
					abi: Abis.tip403Registry,
					functionName: 'policyData',
					args: [policyId],
				},
				{
					address: Addresses.tip403Registry,
					abi: Abis.tip403Registry,
					functionName: 'compoundPolicyData',
					args: [policyId],
				},
			],
		})

		if (results[0].status !== 'success' || !results[0].result) return null
		if (results[1].status !== 'success') return null

		const [rawType, admin] = results[1].result as [number, Address.Address]
		const type = parseTip403PolicyType(Number(rawType))
		const componentPolicies =
			type === 'compound' && results[2].status === 'success'
				? ([...results[2].result].map(String) as [string, string, string])
				: undefined

		const fetchLogsPage = async (
			selector: Hex.Hex,
			direction: 'asc' | 'desc',
			limit: number,
			offset: number,
		) => {
			return (await tempoQueryBuilder(chainId, { engine: 'clickhouse' })
				.selectFrom('logs')
				.select([
					'selector',
					'topic1',
					'topic2',
					'topic3',
					'data',
					'block_num',
					'block_timestamp',
					'tx_hash',
					'log_idx',
				])
				.where('address', '=', registryAddress)
				.where('selector', '=', selector)
				.where('topic1', '=', policyTopic)
				.orderBy('block_num', direction)
				.orderBy('log_idx', direction)
				.limit(limit)
				.offset(offset)
				.execute()) as PolicyLog[]
		}

		const fetchAllLogs = async (selector: Hex.Hex) => {
			return fetchAllPolicyLogPages(
				(limit, offset) => fetchLogsPage(selector, 'asc', limit, offset),
				POLICY_LOG_PAGE_SIZE,
			)
		}

		const fetchRecentLogs = async (selector: Hex.Hex) => {
			return fetchRecentUniquePolicyLogs(
				(limit, offset) => fetchLogsPage(selector, 'desc', limit, offset),
				RECENT_ACTIVITY_LIMIT + 1,
			)
		}

		const [whitelistUpdated, blacklistUpdated, recentByType] =
			await Promise.all([
				fetchAllLogs(eventSelectors.whitelistUpdated),
				fetchAllLogs(eventSelectors.blacklistUpdated),
				Promise.all([
					fetchRecentLogs(eventSelectors.created),
					fetchRecentLogs(eventSelectors.adminUpdated),
					fetchRecentLogs(eventSelectors.whitelistUpdated),
					fetchRecentLogs(eventSelectors.blacklistUpdated),
					fetchRecentLogs(eventSelectors.compoundCreated),
				]),
			])

		const [
			created,
			recentAdminUpdated,
			recentWhitelistUpdated,
			recentBlacklistUpdated,
			compoundCreated,
		] = recentByType

		const membershipEvents = sortLogs(
			[
				...whitelistUpdated.map((log) => ({
					log,
					type: 'whitelist updated' as const,
				})),
				...blacklistUpdated.map((log) => ({
					log,
					type: 'blacklist updated' as const,
				})),
			].map(({ log, type }) => ({ ...log, eventType: type })),
		)

		const recentEvents = sortLogs(
			dedupePolicyLogs([
				...created,
				...recentAdminUpdated,
				...recentWhitelistUpdated,
				...recentBlacklistUpdated,
				...compoundCreated,
			]).map((log) => ({
				...log,
				eventType:
					log.selector === eventSelectors.created
						? 'created'
						: log.selector === eventSelectors.adminUpdated
							? 'admin updated'
							: log.selector === eventSelectors.whitelistUpdated
								? 'whitelist updated'
								: log.selector === eventSelectors.blacklistUpdated
									? 'blacklist updated'
									: 'compound created',
			})),
		).reverse()

		const members = new Map<string, Address.Address>()
		for (const event of membershipEvents) {
			const account = parseAddress(event.topic3)
			if (!account) continue
			updateTip403Member(members, account, parseBool(event.data))
		}

		const activity: Tip403PolicyEvent[] = []
		for (const event of recentEvents.slice(0, RECENT_ACTIVITY_LIMIT)) {
			const account = parseAddress(event.topic3)
			const updater = parseAddress(event.topic2)
			const txHash = event.tx_hash as Hex.Hex | null
			if (!txHash || event.log_idx == null) continue

			activity.push({
				type: event.eventType,
				blockNumber: String(event.block_num ?? 0),
				timestamp: parseTimestamp(event.block_timestamp),
				txHash,
				logIndex: String(event.log_idx),
				updater,
				admin:
					event.eventType === 'admin updated'
						? parseAddress(event.topic3)
						: undefined,
				account:
					event.eventType === 'whitelist updated' ||
					event.eventType === 'blacklist updated'
						? account
						: undefined,
				allowed:
					event.eventType === 'whitelist updated' ||
					event.eventType === 'blacklist updated'
						? parseBool(event.data)
						: undefined,
				componentPolicies:
					event.eventType === 'compound created'
						? decodeCompoundPolicies(event.data)
						: undefined,
			})
		}

		const normalizedQuery = data.query.trim().toLowerCase()
		const allMembers = [...members.values()].filter((member) =>
			!normalizedQuery ? true : member.toLowerCase().includes(normalizedQuery),
		)
		const offset = (data.page - 1) * data.limit

		return {
			policyId: data.policyId,
			type,
			admin,
			componentPolicies,
			members: allMembers.slice(offset, offset + data.limit),
			membersTotal: allMembers.length,
			activity,
			activityTruncated: recentEvents.length > RECENT_ACTIVITY_LIMIT,
		}
	})
