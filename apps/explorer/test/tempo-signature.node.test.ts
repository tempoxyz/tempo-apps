import * as AbiFunction from 'ox/AbiFunction'
import * as Address from 'ox/Address'
import * as Base64 from 'ox/Base64'
import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import * as P256 from 'ox/P256'
import * as Rlp from 'ox/Rlp'
import * as Secp256k1 from 'ox/Secp256k1'
import { TxEnvelopeTempo } from 'ox/tempo'
import { describe, expect, it } from 'vitest'
import * as TempoGas from '#lib/domain/tempo-gas'
import * as TempoSignature from '#lib/domain/tempo-signature'
import * as TempoTransaction from '#lib/domain/tempo-transaction'

const bytes = (size: number, f: (index: number) => number) =>
	Hex.fromBytes(Uint8Array.from({ length: size }, (_, index) => f(index) % 256))

// Vectors computed with an independent implementation (the demo wallet's).
const slhPublicKey = bytes(32, (j) => j * 13 + 1)
const slhSignature = bytes(7_856, (j) => j * 7 + 3)
const vectors = {
	slhOwner: '0x04a405302830e402952a93fea1370e019f622a51',
	p256Owner: '0xd3dc93a6121b287a9a9f20f0f28079bd4faad24f',
	account: '0x1df0807085cf5748a95ca566c354338c8aa0baae',
	commitment:
		'0x0f7cd01889c0700415e43a387266e598acd7fb7ab308ab311266384bd54e8e6f',
	digest: '0x11b155b899d78ebd52714749a615d737b91844afdc3a71b503d759f631f13031',
	signatureGasTotal: 211_634,
	registrationEmpty: 503_483,
	registrationNotEmpty: 253_483,
} as const

const config: TempoSignature.ConfigurableAccountConfig = {
	salt: bytes(32, (j) => j),
	version: 0n,
	threshold: 1,
	owners: [
		{ owner: Address.checksum(vectors.slhOwner), weight: 1 },
		{ owner: Address.checksum(vectors.p256Owner), weight: 1 },
	],
}

const q = (value: bigint | number) =>
	BigInt(value) === 0n ? '0x' : Hex.fromNumber(BigInt(value))

function configurable(
	account: Hex.Hex,
	cfg: TempoSignature.ConfigurableAccountConfig,
	approvals: Hex.Hex[],
): Hex.Hex {
	return Hex.concat(
		'0x05',
		Rlp.fromHex([
			account,
			[
				cfg.salt,
				q(cfg.version),
				q(cfg.threshold),
				cfg.owners.map((owner) => [owner.owner, q(owner.weight)]),
			],
			approvals,
		] as never),
	)
}

const slhApproval = Hex.concat('0x06', '0x01', slhPublicKey, slhSignature)

describe('SLH-DSA owners', () => {
	it('derives the owner address from the public key', () => {
		expect(TempoSignature.slhDsaAddress(1, slhPublicKey).toLowerCase()).toBe(
			vectors.slhOwner,
		)
	})

	it('derives the account, commitment and approval digest', () => {
		expect(TempoSignature.deriveConfigurableAccount(config).toLowerCase()).toBe(
			vectors.account,
		)
		expect(TempoSignature.configCommitment(config)).toBe(vectors.commitment)
		expect(
			TempoSignature.configurableAccountDigest(
				bytes(32, () => 0xaa),
				Address.checksum(vectors.account),
				0n,
			),
		).toBe(vectors.digest)
	})

	it('decodes a 7,890-byte approval with its parameter set', () => {
		const approval = TempoSignature.decode(slhApproval)
		expect(approval).toMatchObject({
			type: 'slhDsa',
			size: 7_890,
			paramId: 1,
			publicKey: slhPublicKey,
			signature: slhSignature,
		})
		expect(approval.type === 'slhDsa' && approval.paramSet?.name).toBe(
			'SLH-DSA-SHA2-128s',
		)
	})

	it('rejects a truncated approval', () => {
		const decoded = TempoSignature.decode(Hex.slice(slhApproval, 0, 7_000))
		expect(decoded.type).toBe('unknown')
	})

	it('lays out R, 14 FORS trees and 7 hypertree layers', () => {
		const layout = TempoSignature.slhDsaLayout(
			TempoSignature.SLH_DSA_PARAM_SETS[1],
		)
		expect(layout).toHaveLength(1 + 14 + 7)
		expect(layout.reduce((sum, segment) => sum + segment.size, 0)).toBe(7_856)
		const fors = layout.filter((segment) => segment.group === 'fors')
		const hypertree = layout.filter((segment) => segment.group === 'hypertree')
		expect(fors.reduce((sum, segment) => sum + segment.size, 0)).toBe(2_912)
		expect(hypertree.reduce((sum, segment) => sum + segment.size, 0)).toBe(
			4_928,
		)
		const last = layout.at(-1)
		expect(last && last.offset + last.size).toBe(7_856)
	})
})

describe('configurable-account signatures', () => {
	const account = Address.checksum(vectors.account)

	it('decodes account, config and approvals', () => {
		const signature = TempoSignature.decode(
			configurable(account, config, [slhApproval]),
		)
		expect(signature.type).toBe('configurable')
		if (signature.type !== 'configurable') return
		expect(signature.account).toBe(account)
		expect(signature.config).toEqual(config)
		expect(signature.approvals.map((approval) => approval.type)).toEqual([
			'slhDsa',
		])
	})

	it('prices an SLH-DSA approval like the wallet does', () => {
		const signature = TempoSignature.decode(
			configurable(account, config, [slhApproval]),
		)
		const gas = TempoGas.signatureGas(signature)
		expect(gas?.verify).toBe(TempoGas.SLH_DSA_VERIFY_GAS)
		expect(gas?.total).toBe(vectors.signatureGasTotal)
		expect(
			TempoGas.registrationGas(config, { createsAccount: true }).total,
		).toBe(vectors.registrationEmpty)
		expect(
			TempoGas.registrationGas(config, { createsAccount: false }).total,
		).toBe(vectors.registrationNotEmpty)
	})
})

describe('primitive signatures', () => {
	const digest = Hash.keccak256(Hex.fromString('tempo'))

	it('recovers secp256k1', () => {
		const privateKey = Secp256k1.randomPrivateKey()
		const expected = Address.fromPublicKey(
			Secp256k1.getPublicKey({ privateKey }),
		)
		const signature = Secp256k1.sign({ payload: digest, privateKey })
		const raw = Hex.concat(
			Hex.fromNumber(signature.r, { size: 32 }),
			Hex.fromNumber(signature.s, { size: 32 }),
			Hex.fromNumber(signature.yParity + 27, { size: 1 }),
		)
		const decoded = TempoSignature.decodePrimitive(raw)
		expect(decoded.type).toBe('secp256k1')
		const signer = TempoSignature.resolvePrimitiveSigner(decoded, digest)
		expect(signer.status).toBe('recovered')
		expect(signer.address && Address.isEqual(signer.address, expected)).toBe(
			true,
		)
	})

	function p256Key() {
		const privateKey = P256.randomPrivateKey()
		const publicKey = P256.getPublicKey({ privateKey })
		return {
			privateKey,
			x: Hex.fromNumber(publicKey.x, { size: 32 }),
			y: Hex.fromNumber(publicKey.y, { size: 32 }),
		}
	}

	function p256Parts(payload: Hex.Hex, privateKey: Hex.Hex) {
		const signature = P256.sign({ payload, privateKey })
		return [
			Hex.fromNumber(signature.r, { size: 32 }),
			Hex.fromNumber(signature.s, { size: 32 }),
		] as const
	}

	it('verifies P256 and derives its address', () => {
		const key = p256Key()
		const [r, s] = p256Parts(digest, key.privateKey)
		const decoded = TempoSignature.decodePrimitive(
			Hex.concat('0x01', r, s, key.x, key.y, '0x00'),
		)
		expect(decoded.size).toBe(130)
		expect(TempoSignature.resolvePrimitiveSigner(decoded, digest)).toEqual({
			address: TempoSignature.p256Address(key.x, key.y),
			status: 'verified',
		})
		expect(
			TempoSignature.resolvePrimitiveSigner(decoded, Hash.keccak256(digest))
				.status,
		).toBe('invalid')
	})

	it('decodes keychain V1 and V2 envelopes around their access key', () => {
		const key = p256Key()
		const user = Address.checksum(`0x${'ab'.repeat(20)}`)
		const v2Digest = TempoSignature.keychainV2Digest(digest, user)
		const [r, s] = p256Parts(v2Digest, key.privateKey)
		const inner = Hex.concat('0x01', r, s, key.x, key.y, '0x00')
		for (const [typeByte, version] of [
			['0x03', 1],
			['0x04', 2],
		] as const) {
			const decoded = TempoSignature.decode(Hex.concat(typeByte, user, inner))
			expect(decoded).toMatchObject({
				type: 'keychain',
				version,
				userAddress: user,
				size: 1 + 20 + 130,
			})
			if (decoded.type !== 'keychain' || decoded.inner.type !== 'p256')
				throw new Error('expected a P256 access key')
			expect(
				TempoSignature.resolvePrimitiveSigner(decoded.inner, v2Digest),
			).toEqual({
				address: TempoSignature.p256Address(key.x, key.y),
				status: 'verified',
			})
		}
		expect(
			TempoSignature.decode(
				Hex.concat('0x04', user, Hex.concat('0x04', user, inner)),
			).type,
		).toBe('unknown')
	})

	it('verifies a WebAuthn assertion over the digest', () => {
		const key = p256Key()
		const authenticatorData = Hex.concat(
			Hash.sha256(Hex.fromString('localhost')),
			'0x05',
			'0x00000000',
		)
		const clientDataJSON = JSON.stringify({
			type: 'webauthn.get',
			challenge: Base64.fromHex(digest, { url: true, pad: false }),
			origin: 'http://localhost',
		})
		const message = Hash.sha256(
			Hex.concat(
				authenticatorData,
				Hash.sha256(Hex.fromString(clientDataJSON)),
			),
		)
		const [r, s] = p256Parts(message, key.privateKey)
		const decoded = TempoSignature.decodePrimitive(
			Hex.concat(
				'0x02',
				authenticatorData,
				Hex.fromString(clientDataJSON),
				r,
				s,
				key.x,
				key.y,
			),
		)
		expect(decoded).toMatchObject({ type: 'webAuthn', clientDataJSON })
		expect(TempoSignature.resolvePrimitiveSigner(decoded, digest).status).toBe(
			'verified',
		)
		expect(
			TempoSignature.resolvePrimitiveSigner(decoded, Hash.keccak256(digest))
				.status,
		).toBe('invalid')
	})

	it('reports unknown type bytes', () => {
		expect(TempoSignature.decode('0x0911')).toMatchObject({
			type: 'unknown',
			typeByte: 9,
		})
	})
})

describe('Tempo transactions', () => {
	const transfer = AbiFunction.from(
		'function transfer(address to, uint256 amount) returns (bool)',
	)
	const envelope = TxEnvelopeTempo.from({
		chainId: 1337,
		calls: [
			{
				to: '0x20c0000000000000000000000000000000000000',
				data: AbiFunction.encodeData(transfer, [
					'0x000000000000000000000000000000000000dEaD',
					1_000_000n,
				]),
			},
		],
		feeToken: '0x20c0000000000000000000000000000000000000',
		gas: 3_000_000n,
		maxFeePerGas: 1_200_000_000n,
		maxPriorityFeePerGas: 0n,
		nonce: 1n,
		nonceKey: 0n,
	})

	it('computes the same signing hash as ox', () => {
		const key = P256.randomPrivateKey()
		const publicKey = P256.getPublicKey({ privateKey: key })
		const payload = TxEnvelopeTempo.getSignPayload(envelope)
		const signature = P256.sign({ payload, privateKey: key })
		const raw = TxEnvelopeTempo.serialize(envelope, {
			signature: {
				type: 'p256',
				signature,
				publicKey,
				prehash: false,
			},
		})
		const decoded = TempoTransaction.decode(raw)
		expect(TempoTransaction.signingHash(decoded)).toBe(payload)
		expect(decoded.calls).toHaveLength(1)
		expect(decoded.nonce).toBe(1n)
		const resolved = TempoTransaction.resolveSignatures(
			decoded,
			TempoSignature.p256Address(
				Hex.fromNumber(publicKey.x, { size: 32 }),
				Hex.fromNumber(publicKey.y, { size: 32 }),
			),
		)
		expect(resolved.signer?.status).toBe('verified')
	})

	it('breaks down intrinsic gas of a registering SLH-DSA transaction', () => {
		const account = Address.checksum(vectors.account)
		const serialized = TxEnvelopeTempo.serialize({ ...envelope, nonce: 0n })
		const fields = Rlp.toHex(Hex.slice(serialized, 1)) as Hex.Hex[]
		const raw = Hex.concat(
			'0x76',
			Rlp.fromHex([
				...fields,
				configurable(account, config, [slhApproval]),
			] as never),
		)
		const tx = TempoTransaction.decode(raw)
		const breakdown = TempoGas.intrinsicGas({
			tx,
			sender: account,
			registered: true,
			senderWasEmpty: true,
		})
		const byKey = Object.fromEntries(
			breakdown.items.map((item) => [item.key, item.gas]),
		)
		const calldata = TempoGas.calldataGas(tx.calls[0]?.input ?? '0x')
		expect(byKey).toEqual({
			base: 21_000,
			calldata,
			nonce: 250_000,
			signatureVerify: 84_000,
			signatureBytes: 127_532,
			configProof: 102,
			// Nonce 0 already pays for creating the account.
			registration: vectors.registrationNotEmpty,
		})
		expect(breakdown.intrinsic).toBe(
			21_000 +
				calldata +
				250_000 +
				vectors.signatureGasTotal +
				vectors.registrationNotEmpty,
		)
		expect(breakdown.unpriced).toEqual([])
	})
})
