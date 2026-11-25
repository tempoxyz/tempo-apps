import * as Address from 'ox/Address'
import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import * as Rlp from 'ox/Rlp'
import * as TempoSignature from './tempo-signature'

/** EIP-2718 type of a Tempo transaction. */
export const TEMPO_TX_TYPE = 0x76
/** Magic byte of the hash a fee payer signs. */
export const FEE_PAYER_SIGNATURE_MAGIC_BYTE = 0x78
/** `nonce_key` of an expiring-nonce transaction (`U256::MAX`). */
export const EXPIRING_NONCE_KEY = 2n ** 256n - 1n

type RlpItem = Hex.Hex | readonly RlpItem[]

export type DecodedCall = {
	/** `undefined` for a contract creation. */
	to: Address.Address | undefined
	value: bigint
	input: Hex.Hex
}

export type DecodedTempoTransaction = {
	chainId: bigint
	maxPriorityFeePerGas: bigint
	maxFeePerGas: bigint
	gasLimit: bigint
	calls: DecodedCall[]
	accessList: { address: Address.Address; storageKeys: Hex.Hex[] }[]
	nonceKey: bigint
	nonce: bigint
	validBefore: bigint | undefined
	validAfter: bigint | undefined
	feeToken: Address.Address | undefined
	feePayerSignature:
		| { yParity: number; r: Hex.Hex; s: Hex.Hex; raw: Hex.Hex; size: number }
		| undefined
	authorizationListLength: number
	hasKeyAuthorization: boolean
	signature: TempoSignature.TempoSignature
	/** The RLP fields before the signature, for signing hashes. */
	fields: readonly RlpItem[]
	/** Byte length of the whole encoded transaction. */
	size: number
}

function asHex(item: RlpItem | undefined): Hex.Hex {
	if (typeof item !== 'string') throw new Error('expected RLP string')
	return item
}

function asList(item: RlpItem | undefined): readonly RlpItem[] {
	if (!Array.isArray(item)) throw new Error('expected RLP list')
	return item as readonly RlpItem[]
}

function toBigInt(hex: Hex.Hex): bigint {
	return hex === '0x' ? 0n : Hex.toBigInt(hex)
}

function optionalAddress(hex: Hex.Hex): Address.Address | undefined {
	return hex === '0x' ? undefined : Address.checksum(hex)
}

/** Whether `raw` is an EIP-2718 Tempo (`0x76`) transaction. */
export function isTempoTransaction(raw: Hex.Hex): boolean {
	return (
		Hex.size(raw) > 1 && Hex.toNumber(Hex.slice(raw, 0, 1)) === TEMPO_TX_TYPE
	)
}

/**
 * Decode a signed Tempo transaction from its EIP-2718 bytes
 * (`eth_getRawTransactionByHash`). The signature is kept as raw bytes and
 * decoded without verification.
 */
export function decode(raw: Hex.Hex): DecodedTempoTransaction {
	if (!isTempoTransaction(raw)) throw new Error('not a Tempo transaction')
	const items = asList(Rlp.toHex(Hex.slice(raw, 1)) as RlpItem)
	if (items.length < 14 || items.length > 15)
		throw new Error('unexpected Tempo transaction field count')
	const hasKeyAuthorization = items.length === 15
	const signature = asHex(items[items.length - 1])
	const fields = items.slice(0, items.length - 1)
	const feePayer = fields[11]
	const feePayerSignature = (() => {
		if (feePayer === '0x' || feePayer === undefined) return undefined
		const [v, r, s] = asList(feePayer)
		const encoded = Rlp.fromHex(feePayer as never)
		return {
			yParity: Number(toBigInt(asHex(v))),
			r: Hex.padLeft(asHex(r), 32),
			s: Hex.padLeft(asHex(s), 32),
			raw: encoded,
			size: Hex.size(encoded),
		}
	})()
	return {
		chainId: toBigInt(asHex(fields[0])),
		maxPriorityFeePerGas: toBigInt(asHex(fields[1])),
		maxFeePerGas: toBigInt(asHex(fields[2])),
		gasLimit: toBigInt(asHex(fields[3])),
		calls: asList(fields[4]).map((call) => {
			const [to, value, input] = asList(call)
			return {
				to: optionalAddress(asHex(to)),
				value: toBigInt(asHex(value)),
				input: asHex(input),
			}
		}),
		accessList: asList(fields[5]).map((entry) => {
			const [address, storageKeys] = asList(entry)
			return {
				address: Address.checksum(asHex(address)),
				storageKeys: asList(storageKeys).map(asHex),
			}
		}),
		nonceKey: toBigInt(asHex(fields[6])),
		nonce: toBigInt(asHex(fields[7])),
		validBefore:
			asHex(fields[8]) === '0x' ? undefined : toBigInt(asHex(fields[8])),
		validAfter:
			asHex(fields[9]) === '0x' ? undefined : toBigInt(asHex(fields[9])),
		feeToken: optionalAddress(asHex(fields[10])),
		feePayerSignature,
		authorizationListLength: asList(fields[12]).length,
		hasKeyAuthorization,
		signature: TempoSignature.decode(signature),
		fields,
		size: Hex.size(raw),
	}
}

/**
 * The hash the sender signs (`TempoTransaction::signature_hash`): the fields
 * without the signature, with a `0x00` placeholder for a fee payer signature,
 * whose presence also leaves the fee token out.
 */
export function signingHash(tx: DecodedTempoTransaction): Hex.Hex {
	const sponsored = tx.feePayerSignature !== undefined
	const fields = tx.fields.map((field, index) => {
		if (index === 10 && sponsored) return '0x'
		if (index === 11) return sponsored ? '0x00' : '0x'
		return field
	})
	return Hash.keccak256(
		Hex.concat(
			Hex.fromNumber(TEMPO_TX_TYPE, { size: 1 }),
			Rlp.fromHex(fields as never),
		),
	)
}

/** The hash a fee payer signs for `sender` (`fee_payer_signature_hash`). */
export function feePayerSigningHash(
	tx: DecodedTempoTransaction,
	sender: Address.Address,
): Hex.Hex {
	const fields = tx.fields.map((field, index) =>
		index === 11 ? sender.toLowerCase() : field,
	)
	return Hash.keccak256(
		Hex.concat(
			Hex.fromNumber(FEE_PAYER_SIGNATURE_MAGIC_BYTE, { size: 1 }),
			Rlp.fromHex(fields as never),
		),
	)
}

export type SignatureRole = 'sender' | 'access key' | 'owner approval'

export type ResolvedApproval = {
	index: number
	signature: TempoSignature.PrimitiveSignature
	signer: TempoSignature.ResolvedSigner
	/** The owner's weight in the signed configuration, if it is an owner. */
	weight: number | undefined
	digest: Hex.Hex
}

export type ResolvedSignatures = {
	signingHash: Hex.Hex
	/** The outer signature, resolved for its own type. */
	outer: TempoSignature.TempoSignature
	/** Signer of a primitive outer signature (or a keychain's inner primitive). */
	signer: TempoSignature.ResolvedSigner | undefined
	/** Configurable-account approvals, directly or inside a keychain signature. */
	configurable:
		| {
				signature: TempoSignature.ConfigurableSignature
				digest: Hex.Hex
				approvals: ResolvedApproval[]
				/** Sum of the approvals' owner weights. */
				weight: number
		  }
		| undefined
	feePayer:
		| {
				address: Address.Address | undefined
				status: TempoSignature.SignerStatus
		  }
		| undefined
}

function resolveConfigurable(
	signature: TempoSignature.ConfigurableSignature,
	innerDigest: Hex.Hex,
): NonNullable<ResolvedSignatures['configurable']> {
	const digest = TempoSignature.configurableAccountDigest(
		innerDigest,
		signature.account,
		signature.config.version,
	)
	const approvals = signature.approvals.map((approval, index) => {
		const signer = TempoSignature.resolvePrimitiveSigner(approval, digest)
		const weight = signature.config.owners.find(
			(owner) => signer.address && Address.isEqual(owner.owner, signer.address),
		)?.weight
		return { index, signature: approval, signer, weight, digest }
	})
	return {
		signature,
		digest,
		approvals,
		weight: approvals.reduce(
			(sum, approval) => sum + (approval.weight ?? 0),
			0,
		),
	}
}

/** Resolve every signature in a transaction to its signer. */
export function resolveSignatures(
	tx: DecodedTempoTransaction,
	sender: Address.Address,
): ResolvedSignatures {
	const hash = signingHash(tx)
	const outer = tx.signature
	let signer: TempoSignature.ResolvedSigner | undefined
	let configurable: ResolvedSignatures['configurable']
	switch (outer.type) {
		case 'configurable':
			configurable = resolveConfigurable(outer, hash)
			break
		case 'keychain': {
			const keyDigest =
				outer.version === 2
					? TempoSignature.keychainV2Digest(hash, outer.userAddress)
					: hash
			if (outer.inner.type === 'configurable')
				configurable = resolveConfigurable(
					outer.inner,
					TempoSignature.keychainV2Digest(hash, outer.userAddress),
				)
			else
				signer = TempoSignature.resolvePrimitiveSigner(outer.inner, keyDigest)
			break
		}
		case 'unknown':
			break
		default:
			signer = TempoSignature.resolvePrimitiveSigner(outer, hash)
	}
	const feePayer = tx.feePayerSignature
		? TempoSignature.resolvePrimitiveSigner(
				TempoSignature.decodePrimitive(
					Hex.concat(
						tx.feePayerSignature.r,
						tx.feePayerSignature.s,
						Hex.fromNumber(tx.feePayerSignature.yParity + 27, { size: 1 }),
					),
				),
				feePayerSigningHash(tx, sender),
			)
		: undefined
	return { signingHash: hash, outer, signer, configurable, feePayer }
}
