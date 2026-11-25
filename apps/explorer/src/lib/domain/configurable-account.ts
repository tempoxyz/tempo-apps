import * as Address from 'ox/Address'
import type * as Hex from 'ox/Hex'
import { decodeEventLog, parseAbi } from 'viem'
import type * as TempoSignature from './tempo-signature'
import * as TempoTransaction from './tempo-transaction'

/** The configurable account precompile (TIP-1107). */
export const CONFIGURABLE_ACCOUNT_PRECOMPILE = Address.checksum(
	'0xaacc000000000000000000000000000000000000',
)

export const configurableAccountAbi = parseAbi([
	'struct ConfigurableAccountOwner { address owner; uint8 weight; }',
	'event ConfigurableAccountConfigUpdated(address indexed account, bytes32 salt, uint64 version, uint8 threshold, ConfigurableAccountOwner[] owners)',
	'event AccountUpgraded(address indexed account, bytes32 indexed commitment, bytes32 salt, uint8 threshold, ConfigurableAccountOwner[] owners)',
])

export type OwnerKind = TempoSignature.PrimitiveSignature['type']

export const OWNER_KIND_LABELS: Record<OwnerKind, string> = {
	secp256k1: 'secp256k1',
	p256: 'P256',
	webAuthn: 'Passkey (WebAuthn)',
	slhDsa: 'SLH-DSA',
}

/** Whether an owner's key type can be broken by a quantum computer. */
export function isClassical(kind: OwnerKind): boolean {
	return kind !== 'slhDsa'
}

export type ConfigUpdate = {
	account: Address.Address
	salt: Hex.Hex
	version: bigint
	threshold: number
	owners: TempoSignature.ConfigurableAccountOwner[]
	kind: 'registered' | 'updated' | 'upgraded'
	blockNumber: bigint
	transactionHash: Hex.Hex
	logIndex: number
}

type RawLog = {
	address: Hex.Hex
	topics: readonly Hex.Hex[]
	data: Hex.Hex
	blockNumber: bigint | Hex.Hex | null
	transactionHash: Hex.Hex | null
	logIndex: number | Hex.Hex | null
}

const toBigInt = (value: bigint | number | Hex.Hex | null) =>
	value === null ? 0n : BigInt(value)

/** Decode a configurable account's config events, oldest first. */
export function parseConfigUpdates(logs: readonly RawLog[]): ConfigUpdate[] {
	const updates: ConfigUpdate[] = []
	for (const log of logs) {
		if (!Address.isEqual(log.address, CONFIGURABLE_ACCOUNT_PRECOMPILE)) continue
		try {
			const event = decodeEventLog({
				abi: configurableAccountAbi,
				topics: log.topics as [Hex.Hex, ...Hex.Hex[]],
				data: log.data,
			})
			const owners = event.args.owners.map((owner) => ({
				owner: Address.checksum(owner.owner),
				weight: owner.weight,
			}))
			const base = {
				account: Address.checksum(event.args.account),
				salt: event.args.salt,
				threshold: event.args.threshold,
				owners,
				blockNumber: toBigInt(log.blockNumber),
				transactionHash: log.transactionHash ?? '0x',
				logIndex: Number(toBigInt(log.logIndex)),
			}
			if (event.eventName === 'AccountUpgraded')
				updates.push({ ...base, version: 0n, kind: 'upgraded' })
			else
				updates.push({
					...base,
					version: event.args.version,
					kind: event.args.version === 0n ? 'registered' : 'updated',
				})
		} catch {}
	}
	return updates.sort((a, b) =>
		a.blockNumber === b.blockNumber
			? a.logIndex - b.logIndex
			: a.blockNumber < b.blockNumber
				? -1
				: 1,
	)
}

/**
 * Owner key types learned from transactions the account signed: each
 * approval's signer, by address. SLH-DSA and P256 owners are derived from
 * their public keys; secp256k1 owners are recovered.
 */
export function ownerKindsFromTransaction(
	raw: Hex.Hex,
	account: Address.Address,
): Map<string, OwnerKind> {
	const kinds = new Map<string, OwnerKind>()
	try {
		const tx = TempoTransaction.decode(raw)
		const resolved = TempoTransaction.resolveSignatures(tx, account)
		const configurable = resolved.configurable
		if (!configurable) return kinds
		if (!Address.isEqual(configurable.signature.account, account)) return kinds
		for (const approval of configurable.approvals) {
			if (!approval.signer.address || approval.signer.status === 'invalid')
				continue
			kinds.set(approval.signer.address.toLowerCase(), approval.signature.type)
		}
	} catch {}
	return kinds
}

export type OwnerView = TempoSignature.ConfigurableAccountOwner & {
	kind: OwnerKind | undefined
}

export type ConfigurableAccountView = {
	current: ConfigUpdate
	owners: OwnerView[]
	history: ConfigUpdate[]
	/** Every current owner is a known SLH-DSA key. */
	quantumOnly: boolean
}

/** The account's current configuration, history and owner key types. */
export function configurableAccountView(
	updates: ConfigUpdate[],
	kinds: Map<string, OwnerKind>,
): ConfigurableAccountView | undefined {
	const current = updates.at(-1)
	if (!current) return undefined
	const owners = current.owners.map((owner) => ({
		...owner,
		kind: kinds.get(owner.owner.toLowerCase()),
	}))
	return {
		current,
		owners,
		history: updates,
		quantumOnly:
			owners.length > 0 &&
			owners.every((owner) => owner.kind !== undefined && !isClassical(owner.kind)),
	}
}
