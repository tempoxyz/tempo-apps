import * as Address from 'ox/Address'
import * as Base64 from 'ox/Base64'
import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import * as P256 from 'ox/P256'
import * as Rlp from 'ox/Rlp'
import * as Secp256k1 from 'ox/Secp256k1'

/**
 * Tempo transaction signatures, decoded from their wire bytes.
 *
 * - 65 bytes: secp256k1 `r || s || v` (no type byte)
 * - `0x01` P256: `r || s || x || y || prehash`
 * - `0x02` WebAuthn: `authenticatorData || clientDataJSON || r || s || x || y`
 * - `0x03` / `0x04` keychain (access key): `user_address || inner`
 * - `0x05` configurable account (TIP-1107): `rlp([account, config, approvals])`
 * - `0x06` SLH-DSA owner approval: `param_id || pk || sig`
 */
export const SIGNATURE_TYPE = {
	p256: 0x01,
	webAuthn: 0x02,
	keychain: 0x03,
	keychainV2: 0x04,
	configurable: 0x05,
	slhDsa: 0x06,
} as const

export const SECP256K1_SIGNATURE_BYTES = 65
export const P256_SIGNATURE_BYTES = 130
export const WEBAUTHN_AUTHENTICATOR_DATA_BYTES = 37

/** SLH-DSA parameter sets by `param_id`. Only `0x01` is valid on chain. */
export const SLH_DSA_PARAM_SETS = {
	1: {
		name: 'SLH-DSA-SHA2-128s',
		standard: 'FIPS 205',
		n: 16,
		publicKeyBytes: 32,
		signatureBytes: 7_856,
		forsTrees: 14,
		forsHeight: 12,
		layers: 7,
		layerHeight: 9,
		wotsChains: 35,
	},
} as const

export type SlhDsaParamSet =
	(typeof SLH_DSA_PARAM_SETS)[keyof typeof SLH_DSA_PARAM_SETS]

export const SLH_DSA_ADDRESS_DOMAIN = 'tempo:slh-dsa:address'
export const CONFIGURABLE_ACCOUNT_SIGNATURE_DOMAIN =
	'tempo:configurable-account:signature'
export const CONFIGURABLE_ACCOUNT_DOMAIN = 'tempo:configurable-account:account'
export const CONFIGURABLE_ACCOUNT_CONFIG_DOMAIN =
	'tempo:configurable-account:config'

export type ConfigurableAccountOwner = {
	owner: Address.Address
	weight: number
}

export type ConfigurableAccountConfig = {
	salt: Hex.Hex
	version: bigint
	threshold: number
	owners: ConfigurableAccountOwner[]
}

type Base = {
	/** The signature's encoded bytes, type byte included. */
	raw: Hex.Hex
	/** Byte length of `raw`. */
	size: number
}

export type Secp256k1Signature = Base & {
	type: 'secp256k1'
	r: Hex.Hex
	s: Hex.Hex
	yParity: number
}

export type P256Signature = Base & {
	type: 'p256'
	r: Hex.Hex
	s: Hex.Hex
	x: Hex.Hex
	y: Hex.Hex
	prehash: boolean
}

export type WebAuthnSignature = Base & {
	type: 'webAuthn'
	r: Hex.Hex
	s: Hex.Hex
	x: Hex.Hex
	y: Hex.Hex
	authenticatorData: Hex.Hex
	clientDataJSON: string
	/** `authenticatorData || clientDataJSON`, priced as calldata. */
	webAuthnData: Hex.Hex
}

export type SlhDsaSignature = Base & {
	type: 'slhDsa'
	paramId: number
	paramSet: SlhDsaParamSet | undefined
	publicKey: Hex.Hex
	signature: Hex.Hex
}

export type PrimitiveSignature =
	| Secp256k1Signature
	| P256Signature
	| WebAuthnSignature
	| SlhDsaSignature

export type ConfigurableSignature = Base & {
	type: 'configurable'
	account: Address.Address
	config: ConfigurableAccountConfig
	approvals: PrimitiveSignature[]
	/** `rlp(account) || rlp(config)`, priced as calldata. */
	witness: Hex.Hex
}

export type KeychainSignature = Base & {
	type: 'keychain'
	version: 1 | 2
	userAddress: Address.Address
	inner: PrimitiveSignature | ConfigurableSignature
}

export type UnknownSignature = Base & {
	type: 'unknown'
	typeByte: number
	error: string
}

export type TempoSignature =
	| PrimitiveSignature
	| ConfigurableSignature
	| KeychainSignature
	| UnknownSignature

export const SIGNATURE_LABELS: Record<TempoSignature['type'], string> = {
	secp256k1: 'secp256k1',
	p256: 'P256',
	webAuthn: 'WebAuthn (passkey)',
	slhDsa: 'SLH-DSA',
	configurable: 'Configurable account',
	keychain: 'Access key',
	unknown: 'Unknown',
}

function slice(hex: Hex.Hex, start: number, end?: number): Hex.Hex {
	return Hex.slice(hex, start, end, { strict: false })
}

/** Decode a primitive signature (an approval or an outer signature). */
export function decodePrimitive(raw: Hex.Hex): PrimitiveSignature {
	const signature = decode(raw)
	if (signature.type === 'unknown') throw new Error(signature.error)
	if (signature.type === 'configurable' || signature.type === 'keychain')
		throw new Error(`${signature.type} signature is not a primitive signature`)
	return signature
}

/** Decode a Tempo signature from its wire bytes. Never throws. */
export function decode(raw: Hex.Hex): TempoSignature {
	const size = Hex.size(raw)
	try {
		return decodeOrThrow(raw, size)
	} catch (error) {
		return {
			type: 'unknown',
			raw,
			size,
			typeByte: size > 0 ? Hex.toNumber(slice(raw, 0, 1)) : -1,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

function decodeOrThrow(raw: Hex.Hex, size: number): TempoSignature {
	if (size === SECP256K1_SIGNATURE_BYTES) {
		const v = Hex.toNumber(slice(raw, 64, 65))
		return {
			type: 'secp256k1',
			raw,
			size,
			r: slice(raw, 0, 32),
			s: slice(raw, 32, 64),
			yParity: v >= 27 ? v - 27 : v,
		}
	}
	if (size === 0) throw new Error('empty signature')
	const typeByte = Hex.toNumber(slice(raw, 0, 1))
	const body = slice(raw, 1)
	const bodySize = size - 1
	switch (typeByte) {
		case SIGNATURE_TYPE.p256: {
			if (size !== P256_SIGNATURE_BYTES)
				throw new Error(`P256 signature must be ${P256_SIGNATURE_BYTES} bytes`)
			return {
				type: 'p256',
				raw,
				size,
				r: slice(body, 0, 32),
				s: slice(body, 32, 64),
				x: slice(body, 64, 96),
				y: slice(body, 96, 128),
				prehash: Hex.toNumber(slice(body, 128, 129)) !== 0,
			}
		}
		case SIGNATURE_TYPE.webAuthn: {
			if (bodySize < 128 + WEBAUTHN_AUTHENTICATOR_DATA_BYTES)
				throw new Error('WebAuthn signature too short')
			const dataSize = bodySize - 128
			const webAuthnData = slice(body, 0, dataSize)
			const tail = slice(body, dataSize)
			return {
				type: 'webAuthn',
				raw,
				size,
				webAuthnData,
				authenticatorData: slice(
					webAuthnData,
					0,
					WEBAUTHN_AUTHENTICATOR_DATA_BYTES,
				),
				clientDataJSON: Hex.toString(
					slice(webAuthnData, WEBAUTHN_AUTHENTICATOR_DATA_BYTES),
				),
				r: slice(tail, 0, 32),
				s: slice(tail, 32, 64),
				x: slice(tail, 64, 96),
				y: slice(tail, 96, 128),
			}
		}
		case SIGNATURE_TYPE.keychain:
		case SIGNATURE_TYPE.keychainV2: {
			if (bodySize <= 20) throw new Error('keychain signature too short')
			const inner = decode(slice(body, 20))
			if (inner.type === 'unknown') throw new Error(inner.error)
			if (inner.type === 'keychain') throw new Error('nested keychain signature')
			return {
				type: 'keychain',
				raw,
				size,
				version: typeByte === SIGNATURE_TYPE.keychain ? 1 : 2,
				userAddress: Address.checksum(slice(body, 0, 20)),
				inner,
			}
		}
		case SIGNATURE_TYPE.configurable:
			return decodeConfigurable(raw, body, size)
		case SIGNATURE_TYPE.slhDsa: {
			const paramId = Hex.toNumber(slice(body, 0, 1))
			const paramSet =
				SLH_DSA_PARAM_SETS[paramId as keyof typeof SLH_DSA_PARAM_SETS]
			const publicKeyBytes = paramSet?.publicKeyBytes ?? 32
			if (
				paramSet &&
				bodySize !== 1 + publicKeyBytes + paramSet.signatureBytes
			)
				throw new Error(
					`${paramSet.name} approval must be ${2 + publicKeyBytes + paramSet.signatureBytes} bytes`,
				)
			return {
				type: 'slhDsa',
				raw,
				size,
				paramId,
				paramSet,
				publicKey: slice(body, 1, 1 + publicKeyBytes),
				signature: slice(body, 1 + publicKeyBytes),
			}
		}
		default:
			throw new Error(`unknown signature type 0x${typeByte.toString(16)}`)
	}
}

type RlpItem = Hex.Hex | readonly RlpItem[]

function asHex(item: RlpItem | undefined): Hex.Hex {
	if (typeof item !== 'string') throw new Error('expected RLP string')
	return item
}

function asList(item: RlpItem | undefined): readonly RlpItem[] {
	if (!Array.isArray(item)) throw new Error('expected RLP list')
	return item as readonly RlpItem[]
}

function toNumber(hex: Hex.Hex): number {
	return hex === '0x' ? 0 : Hex.toNumber(hex)
}

function toBigInt(hex: Hex.Hex): bigint {
	return hex === '0x' ? 0n : Hex.toBigInt(hex)
}

function decodeConfigurable(
	raw: Hex.Hex,
	body: Hex.Hex,
	size: number,
): ConfigurableSignature {
	const fields = asList(Rlp.toHex(body) as RlpItem)
	const [account, config, approvals] = fields
	if (fields.length !== 3)
		throw new Error('configurable signature must be [account, config, approvals]')
	const configFields = asList(config)
	const [salt, version, threshold, owners] = configFields
	if (configFields.length !== 4)
		throw new Error('config must be [salt, version, threshold, owners]')
	return {
		type: 'configurable',
		raw,
		size,
		// rlp(account) || rlp(config), as the node prices the witness.
		witness: Hex.concat(
			Rlp.fromHex(asHex(account)),
			Rlp.fromHex(config as never),
		),
		account: Address.checksum(asHex(account)),
		config: {
			salt: asHex(salt),
			version: toBigInt(asHex(version)),
			threshold: toNumber(asHex(threshold)),
			owners: asList(owners).map((entry) => {
				const [owner, weight] = asList(entry)
				return {
					owner: Address.checksum(asHex(owner)),
					weight: toNumber(asHex(weight)),
				}
			}),
		},
		approvals: asList(approvals).map((approval) =>
			decodePrimitive(asHex(approval)),
		),
	}
}

// --- Owner addresses and digests ------------------------------------------

/** `last20(keccak256("tempo:slh-dsa:address" || param_id || pk))`. */
export function slhDsaAddress(paramId: number, publicKey: Hex.Hex) {
	return Address.checksum(
		slice(
			Hash.keccak256(
				Hex.concat(
					Hex.fromString(SLH_DSA_ADDRESS_DOMAIN),
					Hex.fromNumber(paramId, { size: 1 }),
					publicKey,
				),
			),
			12,
		),
	)
}

/** A P256 key's Tempo address: `last20(keccak256(x || y))`. */
export function p256Address(x: Hex.Hex, y: Hex.Hex) {
	return Address.checksum(slice(Hash.keccak256(Hex.concat(x, y)), 12))
}

/** What a configurable account's owners sign for `innerDigest` (TIP-1107). */
export function configurableAccountDigest(
	innerDigest: Hex.Hex,
	account: Address.Address,
	version: bigint,
): Hex.Hex {
	return Hash.keccak256(
		Hex.concat(
			Hex.fromString(CONFIGURABLE_ACCOUNT_SIGNATURE_DOMAIN),
			innerDigest,
			account,
			Hex.fromNumber(version, { size: 8 }),
		),
	)
}

/** What an access key signs under keychain V2: `keccak256(0x04 || hash || user)`. */
export function keychainV2Digest(
	innerDigest: Hex.Hex,
	userAddress: Address.Address,
): Hex.Hex {
	return Hash.keccak256(Hex.concat('0x04', innerDigest, userAddress))
}

function ownerSet(config: ConfigurableAccountConfig): Hex.Hex {
	return Hex.concat(
		Hex.fromNumber(config.threshold, { size: 1 }),
		Hex.fromNumber(config.owners.length, { size: 1 }),
		...config.owners.flatMap(({ owner, weight }) => [
			owner,
			Hex.fromNumber(weight, { size: 1 }),
		]),
	)
}

/** The address a version-0 configuration derives (TIP-1107). */
export function deriveConfigurableAccount(config: ConfigurableAccountConfig) {
	return Address.checksum(
		slice(
			Hash.keccak256(
				Hex.concat(
					Hex.fromString(CONFIGURABLE_ACCOUNT_DOMAIN),
					config.salt,
					ownerSet(config),
				),
			),
			12,
		),
	)
}

/** The commitment a configuration stores in the account leaf (TIP-1107). */
export function configCommitment(config: ConfigurableAccountConfig): Hex.Hex {
	return Hash.keccak256(
		Hex.concat(
			Hex.fromString(CONFIGURABLE_ACCOUNT_CONFIG_DOMAIN),
			config.salt,
			Hex.fromNumber(config.version, { size: 8 }),
			ownerSet(config),
		),
	)
}

// --- Signers --------------------------------------------------------------

/**
 * - `verified`: a P256 or WebAuthn signature checked over the digest here.
 * - `recovered`: a secp256k1 signer recovered from the digest.
 * - `derived`: the address derived from the public key; not verified here.
 * - `invalid`: the signature doesn't verify over the digest.
 */
export type SignerStatus = 'verified' | 'recovered' | 'derived' | 'invalid'

export type ResolvedSigner = {
	address: Address.Address | undefined
	status: SignerStatus
}

/** The P256 message a WebAuthn assertion signs, if it is well formed for `digest`. */
export function webAuthnMessage(
	signature: WebAuthnSignature,
	digest: Hex.Hex,
): Hex.Hex | undefined {
	try {
		const flags = Hex.toNumber(slice(signature.authenticatorData, 32, 33))
		// UP or UV set; AT and ED unset.
		if ((flags & 0x05) === 0 || flags & 0x40 || flags & 0x80) return undefined
		const clientData = JSON.parse(signature.clientDataJSON) as {
			type?: unknown
			challenge?: unknown
		}
		if (clientData.type !== 'webauthn.get') return undefined
		if (clientData.challenge !== Base64.fromHex(digest, { url: true, pad: false }))
			return undefined
		return Hash.sha256(
			Hex.concat(
				signature.authenticatorData,
				Hash.sha256(Hex.fromString(signature.clientDataJSON)),
			),
		)
	} catch {
		return undefined
	}
}

function verifyP256(
	payload: Hex.Hex,
	signature: { r: Hex.Hex; s: Hex.Hex; x: Hex.Hex; y: Hex.Hex },
): boolean {
	try {
		return P256.verify({
			payload,
			publicKey: {
				prefix: 4,
				x: Hex.toBigInt(signature.x),
				y: Hex.toBigInt(signature.y),
			},
			signature: {
				r: Hex.toBigInt(signature.r),
				s: Hex.toBigInt(signature.s),
			},
		})
	} catch {
		return false
	}
}

/**
 * The signer of a primitive signature over `digest`. P256 and WebAuthn are
 * verified (cheap); an SLH-DSA owner's address is derived from its public key.
 */
export function resolvePrimitiveSigner(
	signature: PrimitiveSignature,
	digest: Hex.Hex | undefined,
): ResolvedSigner {
	switch (signature.type) {
		case 'secp256k1': {
			if (!digest) return { address: undefined, status: 'derived' }
			try {
				const address = Secp256k1.recoverAddress({
					payload: digest,
					signature: {
						r: Hex.toBigInt(signature.r),
						s: Hex.toBigInt(signature.s),
						yParity: signature.yParity,
					},
				})
				return { address: Address.checksum(address), status: 'recovered' }
			} catch {
				return { address: undefined, status: 'invalid' }
			}
		}
		case 'p256': {
			const address = p256Address(signature.x, signature.y)
			if (!digest) return { address, status: 'derived' }
			const payload = signature.prehash ? Hash.sha256(digest) : digest
			return {
				address,
				status: verifyP256(payload, signature) ? 'verified' : 'invalid',
			}
		}
		case 'webAuthn': {
			const address = p256Address(signature.x, signature.y)
			if (!digest) return { address, status: 'derived' }
			const message = webAuthnMessage(signature, digest)
			return {
				address,
				status:
					message && verifyP256(message, signature) ? 'verified' : 'invalid',
			}
		}
		case 'slhDsa':
			return {
				address: slhDsaAddress(signature.paramId, signature.publicKey),
				status: 'derived',
			}
	}
}

// --- SLH-DSA structure ----------------------------------------------------

export type SlhDsaSegment = {
	key: string
	label: string
	/** Byte offset in the signature. */
	offset: number
	size: number
	group: 'randomizer' | 'fors' | 'hypertree'
	parts: { label: string; size: number }[]
}

/**
 * The parts of an SLH-DSA signature (FIPS 205, section 9.2): `R || SIG_FORS ||
 * SIG_HT`, with k FORS trees of (secret key, auth path) and d hypertree layers
 * of (WOTS+ signature, auth path).
 */
export function slhDsaLayout(paramSet: SlhDsaParamSet): SlhDsaSegment[] {
	const { n, forsTrees, forsHeight, layers, layerHeight, wotsChains } =
		paramSet
	const segments: SlhDsaSegment[] = [
		{
			key: 'r',
			label: 'R (randomizer)',
			offset: 0,
			size: n,
			group: 'randomizer',
			parts: [{ label: 'R', size: n }],
		},
	]
	let offset = n
	for (let tree = 0; tree < forsTrees; tree++) {
		const size = n + forsHeight * n
		segments.push({
			key: `fors-${tree}`,
			label: `FORS tree ${tree + 1}`,
			offset,
			size,
			group: 'fors',
			parts: [
				{ label: 'secret key', size: n },
				{ label: `auth path, ${forsHeight} × ${n} B`, size: forsHeight * n },
			],
		})
		offset += size
	}
	for (let layer = 0; layer < layers; layer++) {
		const size = wotsChains * n + layerHeight * n
		segments.push({
			key: `ht-${layer}`,
			label: `Hypertree layer ${layer + 1}`,
			offset,
			size,
			group: 'hypertree',
			parts: [
				{ label: `WOTS+, ${wotsChains} × ${n} B`, size: wotsChains * n },
				{
					label: `auth path, ${layerHeight} × ${n} B`,
					size: layerHeight * n,
				},
			],
		})
		offset += size
	}
	return segments
}
