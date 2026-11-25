import * as Hex from 'ox/Hex'
import type * as TempoSignature from './tempo-signature'
import {
	type DecodedTempoTransaction,
	EXPIRING_NONCE_KEY,
} from './tempo-transaction'

/**
 * Intrinsic gas of a Tempo transaction, computed the way the node charges it
 * before any call runs (tempo `crates/evm/src/handler.rs` `intrinsic_gas` and
 * `nonce_intrinsic_gas`, `handler/configurable_account`, TIP-1107 "Gas").
 */
export const TX_BASE_GAS = 21_000
export const TOKEN_GAS = 4
export const FLOOR_TOKEN_GAS = 10
export const SECP256K1_VERIFY_GAS = 3_000
export const P256_VERIFY_GAS = 8_000
export const WEBAUTHN_VERIFY_GAS = 8_000
/**
 * SLH-DSA-SHA2-128s owner approval verification. Benchmarked against the
 * node's P256 verification and scaled to `P256_VERIFY_GAS`, rounded up to a
 * thousand; must match the node.
 */
export const SLH_DSA_VERIFY_GAS = 87_000
/** Access-key validation: a cold SLOAD and processing. */
export const KEYCHAIN_VALIDATION_GAS = 3_000
export const COLD_ACCOUNT_GAS = 2_600
export const WARM_ACCOUNT_GAS = 100
export const ACCESS_LIST_ADDRESS_GAS = 2_400
export const ACCESS_LIST_STORAGE_KEY_GAS = 1_900
/** TIP-1000 new state element (account creation, nonce 0, commitment write). */
export const NEW_ACCOUNT_GAS = 250_000
/** TIP-1000 CREATE cost. */
export const CREATE_GAS = 500_000
export const INITCODE_WORD_GAS = 2
/** Expiring nonce: 2 cold SLOADs, a warm read and 3 resets. */
export const EXPIRING_NONCE_GAS = 13_000
/** An existing 2D nonce key: cold SLOAD, warm reset and 2 warm SLOADs. */
export const EXISTING_NONCE_KEY_GAS = 5_200
const LOG_GAS = 375
const LOG_TOPIC_GAS = 375
const LOG_DATA_BYTE_GAS = 8

const ACCOUNT_DOMAIN_BYTES = 34
const CONFIG_DOMAIN_BYTES = 33
const SIGNATURE_DOMAIN_BYTES = 36

/** `KECCAK256` over `size` bytes: `30 + 6 × ceil(size / 32)`. */
export function keccakGas(size: number): number {
	return 30 + 6 * Math.ceil(size / 32)
}

/** Calldata tokens: 1 per zero byte, 4 per other byte. */
export function calldataTokens(data: Hex.Hex): number {
	const bytes = Hex.toBytes(data)
	let tokens = 0
	for (const byte of bytes) tokens += byte === 0 ? 1 : 4
	return tokens
}

/** Calldata gas: `tokens × 4` (16 per nonzero byte, 4 per zero byte). */
export function calldataGas(data: Hex.Hex): number {
	return calldataTokens(data) * TOKEN_GAS
}

/** The verification gas of one primitive signature (`verification_gas`). */
export function primitiveVerifyGas(
	signature: TempoSignature.PrimitiveSignature,
): number {
	switch (signature.type) {
		case 'secp256k1':
			return SECP256K1_VERIFY_GAS
		case 'p256':
			return P256_VERIFY_GAS
		case 'webAuthn':
			return WEBAUTHN_VERIFY_GAS
		case 'slhDsa':
			return SLH_DSA_VERIFY_GAS
	}
}

/**
 * The calldata gas of a primitive signature's own data: WebAuthn's
 * `authenticatorData || clientDataJSON`, SLH-DSA's `param_id || pk || sig`.
 */
export function primitiveDataGas(
	signature: TempoSignature.PrimitiveSignature,
): number {
	switch (signature.type) {
		case 'webAuthn':
			return calldataGas(signature.webAuthnData)
		case 'slhDsa':
			return calldataGas(Hex.slice(signature.raw, 1))
		default:
			return 0
	}
}

export type ApprovalGas = { verify: number; data: number }

export type SignatureGas = {
	/** Verification of every signature, before the 3,000 the base covers. */
	verify: number
	/** Calldata of signature data: WebAuthn data, SLH-DSA key and signature. */
	data: number
	/** Calldata of a configurable account's `rlp(account) || rlp(config)`. */
	witness: number
	/** Configuration hashes: commitment and approval digest preimages. */
	hashes: number
	/** Access-key validation. */
	keychain: number
	approvals: ApprovalGas[]
	/** What the signature adds to intrinsic gas: the sum less 3,000. */
	total: number
}

/** The intrinsic gas of a transaction's outer signature. */
export function signatureGas(
	signature: TempoSignature.TempoSignature,
): SignatureGas | undefined {
	const empty = { verify: 0, data: 0, witness: 0, hashes: 0, keychain: 0 }
	const inner = signature.type === 'keychain' ? signature.inner : signature
	const keychain = signature.type === 'keychain' ? KEYCHAIN_VALIDATION_GAS : 0
	if (inner.type === 'unknown' || inner.type === 'keychain') return undefined
	if (inner.type === 'configurable') {
		const approvals = inner.approvals.map((approval) => ({
			verify: primitiveVerifyGas(approval),
			data: primitiveDataGas(approval),
		}))
		const parts = {
			...empty,
			verify: approvals.reduce((sum, a) => sum + a.verify, 0),
			data: approvals.reduce((sum, a) => sum + a.data, 0),
			witness: calldataGas(inner.witness),
			hashes:
				keccakGas(
					CONFIG_DOMAIN_BYTES + 32 + 8 + 2 + 21 * inner.config.owners.length,
				) + keccakGas(SIGNATURE_DOMAIN_BYTES + 32 + 20 + 8),
			keychain,
		}
		return {
			...parts,
			approvals,
			total:
				parts.verify +
				parts.data +
				parts.witness +
				parts.hashes +
				keychain -
				SECP256K1_VERIFY_GAS,
		}
	}
	const one = { verify: primitiveVerifyGas(inner), data: primitiveDataGas(inner) }
	return {
		...empty,
		...one,
		keychain,
		approvals: [],
		total: one.verify + one.data + keychain - SECP256K1_VERIFY_GAS,
	}
}

/** Gas to register a configurable account on first use (TIP-1107). */
export function registrationGas(
	config: TempoSignature.ConfigurableAccountConfig,
	options: { createsAccount: boolean },
) {
	const owners = config.owners.length
	const derivation = keccakGas(ACCOUNT_DOMAIN_BYTES + 32 + 2 + 21 * owners)
	// ConfigurableAccountConfigUpdated: 2 topics, 160 + 64 × owners data bytes.
	const log = LOG_GAS + 2 * LOG_TOPIC_GAS + LOG_DATA_BYTE_GAS * (160 + 64 * owners)
	const account = options.createsAccount ? NEW_ACCOUNT_GAS : 0
	return {
		derivation,
		commitment: NEW_ACCOUNT_GAS,
		log,
		account,
		total: derivation + NEW_ACCOUNT_GAS + log + account,
	}
}

export type GasItem = {
	key:
		| 'base'
		| 'calldata'
		| 'calls'
		| 'create'
		| 'accessList'
		| 'nonce'
		| 'signatureVerify'
		| 'signatureBytes'
		| 'configProof'
		| 'keychain'
		| 'registration'
	label: string
	gas: number
	detail: string
}

export type GasBreakdown = {
	items: GasItem[]
	/** Intrinsic gas: the regular charge before execution. */
	intrinsic: number
	/** EIP-7623 floor: what the transaction pays at least. */
	floor: number
	/** Parts this explorer can't price; the intrinsic total leaves them out. */
	unpriced: string[]
}

export declare namespace intrinsicGas {
	type Options = {
		tx: DecodedTempoTransaction
		sender: Hex.Hex
		/** Whether this transaction registered the sender's configurable account. */
		registered: boolean
		/** Whether the sender had no nonce, code or native balance before it. */
		senderWasEmpty: boolean
		/** Addresses warm before execution besides the sender and first target. */
		isPrecompile?: ((address: Hex.Hex) => boolean) | undefined
	}
}

const fmt = (value: number) => value.toLocaleString('en-US')

/** Tempo precompiles and TIP-20 tokens, warm in every transaction. */
export function isTempoPrecompile(address: Hex.Hex): boolean {
	const lower = address.toLowerCase()
	return (
		/^0x0{38}(0[1-9a-f]|1[0-1])$/.test(lower) ||
		/^0x20c0[0-9a-f]{36}$/.test(lower) ||
		/^0x[0-9a-f]{4}0{36}$/.test(lower)
	)
}

/** The intrinsic gas of a Tempo transaction, by part. */
export function intrinsicGas(options: intrinsicGas.Options): GasBreakdown {
	const { tx, sender, registered, senderWasEmpty } = options
	const isPrecompile = options.isPrecompile ?? isTempoPrecompile
	const items: GasItem[] = []
	const unpriced: string[] = []

	items.push({
		key: 'base',
		label: 'Base',
		gas: TX_BASE_GAS,
		detail: 'Transaction stipend; covers one secp256k1 signature (3,000)',
	})

	let tokens = 0
	for (const call of tx.calls) tokens += calldataTokens(call.input)
	const inputBytes = tx.calls.reduce((sum, call) => sum + Hex.size(call.input), 0)
	items.push({
		key: 'calldata',
		label: 'Calldata',
		gas: tokens * TOKEN_GAS,
		detail: `${fmt(inputBytes)} bytes of call input, ${fmt(tokens)} tokens × 4`,
	})

	// T14: a call after the first pays a cold access only for a new target
	// outside the warm set (sender, first target, precompiles, access list).
	const first = tx.calls[0]?.to?.toLowerCase()
	const warm = new Set(
		[sender, ...tx.accessList.map((entry) => entry.address)].map((address) =>
			address.toLowerCase(),
		),
	)
	const targeted = new Set<string>()
	let callAccess = 0
	for (const call of tx.calls.slice(1)) {
		const to = call.to?.toLowerCase()
		if (!to) continue
		const isWarm =
			to === first || warm.has(to) || isPrecompile(to) || targeted.has(to)
		targeted.add(to)
		callAccess += isWarm ? WARM_ACCOUNT_GAS : COLD_ACCOUNT_GAS
	}
	if (tx.calls.length > 1)
		items.push({
			key: 'calls',
			label: 'Batch calls',
			gas: callAccess,
			detail: `Account access for ${tx.calls.length - 1} calls after the first`,
		})

	const creates = tx.calls.filter((call) => !call.to)
	if (creates.length)
		items.push({
			key: 'create',
			label: 'Contract creation',
			gas: creates.reduce(
				(sum, call) =>
					sum +
					CREATE_GAS +
					INITCODE_WORD_GAS * Math.ceil(Hex.size(call.input) / 32),
				0,
			),
			detail: '500,000 per CREATE plus initcode words',
		})

	const storageKeys = tx.accessList.reduce(
		(sum, entry) => sum + entry.storageKeys.length,
		0,
	)
	if (tx.accessList.length)
		items.push({
			key: 'accessList',
			label: 'Access list',
			gas:
				tx.accessList.length * ACCESS_LIST_ADDRESS_GAS +
				storageKeys * ACCESS_LIST_STORAGE_KEY_GAS,
			detail: `${tx.accessList.length} addresses, ${storageKeys} storage keys`,
		})

	const nonce =
		tx.nonceKey === EXPIRING_NONCE_KEY
			? { gas: EXPIRING_NONCE_GAS, detail: 'Expiring nonce' }
			: tx.nonce === 0n
				? { gas: NEW_ACCOUNT_GAS, detail: 'First use of a nonce (nonce 0)' }
				: tx.nonceKey !== 0n
					? { gas: EXISTING_NONCE_KEY_GAS, detail: '2D nonce key update' }
					: { gas: 0, detail: 'Protocol nonce' }
	if (nonce.gas) items.push({ key: 'nonce', label: 'Nonce', ...nonce })

	const signature = signatureGas(tx.signature)
	if (!signature) unpriced.push('signature of an unknown type')
	else {
		const approvals = signature.approvals.length
		items.push({
			key: 'signatureVerify',
			label: 'Signature verification',
			gas: signature.verify - SECP256K1_VERIFY_GAS,
			detail: approvals
				? `${approvals} approval${approvals === 1 ? '' : 's'}: ${signature.approvals.map((a) => fmt(a.verify)).join(' + ')}, less the 3,000 the base covers`
				: `${fmt(signature.verify)}, less the 3,000 the base covers`,
		})
		if (signature.data || signature.witness)
			items.push({
				key: 'signatureBytes',
				label: 'Signature bytes',
				gas: signature.data + signature.witness,
				detail: [
					signature.data
						? `signature data ${fmt(signature.data)}`
						: undefined,
					signature.witness
						? `account and config ${fmt(signature.witness)}`
						: undefined,
				]
					.filter(Boolean)
					.join(', '),
			})
		if (signature.hashes)
			items.push({
				key: 'configProof',
				label: 'Configuration hashes',
				gas: signature.hashes,
				detail: 'Commitment and approval digest (keccak256)',
			})
		if (signature.keychain)
			items.push({
				key: 'keychain',
				label: 'Access key',
				gas: signature.keychain,
				detail: 'Access-key validation',
			})
	}

	const configurable =
		tx.signature.type === 'configurable'
			? tx.signature
			: tx.signature.type === 'keychain' &&
					tx.signature.inner.type === 'configurable'
				? tx.signature.inner
				: undefined
	if (configurable && registered) {
		// The sender's creation is free only when the nonce-0 charge pays it.
		const paysNonceZero = tx.nonceKey === 0n && tx.nonce === 0n
		const registration = registrationGas(configurable.config, {
			createsAccount: senderWasEmpty && !paysNonceZero,
		})
		items.push({
			key: 'registration',
			label: 'Registration',
			gas: registration.total,
			detail: [
				`commitment ${fmt(registration.commitment)}`,
				`address hash ${fmt(registration.derivation)}`,
				`event ${fmt(registration.log)}`,
				registration.account
					? `new account ${fmt(registration.account)}`
					: undefined,
			]
				.filter(Boolean)
				.join(', '),
		})
	}

	if (tx.authorizationListLength) unpriced.push('authorization list')
	if (tx.hasKeyAuthorization) unpriced.push('key authorization')
	if (tx.feePayerSignature && tx.signature.type === 'keychain')
		unpriced.push('access-key account loads')

	const intrinsic = items.reduce((sum, item) => sum + item.gas, 0)
	// EIP-7623 floor over call input; access-list bytes also count toward it.
	const floor = TX_BASE_GAS + tokens * FLOOR_TOKEN_GAS
	if (tx.accessList.length) unpriced.push('access-list floor bytes')
	return { items, intrinsic, floor, unpriced }
}
