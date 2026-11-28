import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as Rlp from 'ox/Rlp'
import { describe, expect, it } from 'vitest'
import {
	configurableAccountView,
	type ConfigUpdate,
} from '#lib/domain/configurable-account'
import { hasDecodableSignature, withoutUndecodableSignature } from '#lib/chains'
import * as TempoGas from '#lib/domain/tempo-gas'
import * as TempoSignature from '#lib/domain/tempo-signature'
import vector from './fixtures/slh-dsa-sha2-128s.json' with { type: 'json' }

// The node's worked examples (tempo-primitives `gas_worked_examples`):
// salt 0x63 × 32, threshold 1, weights 1, a passkey owner and the vector's
// SLH-DSA owner.
const passkeyOwner = Address.checksum(
	'0xad7894222A2485cBa18369b6438597118eE58EDc',
)
const slhOwner = Address.checksum(vector.address as Hex.Hex)
const salt = `0x${'63'.repeat(32)}` as Hex.Hex

const q = (value: bigint | number) =>
	BigInt(value) === 0n ? '0x' : Hex.fromNumber(BigInt(value))

function sortOwners(owners: TempoSignature.ConfigurableAccountOwner[]) {
	return [...owners].sort((a, b) =>
		a.owner.toLowerCase() < b.owner.toLowerCase() ? -1 : 1,
	)
}

function configurable(
	account: Hex.Hex,
	config: TempoSignature.ConfigurableAccountConfig,
	approvals: Hex.Hex[],
): Hex.Hex {
	return Hex.concat(
		'0x05',
		Rlp.fromHex([
			account,
			[
				config.salt,
				q(config.version),
				q(config.threshold),
				config.owners.map((owner) => [owner.owner, q(owner.weight)]),
			],
			approvals,
		]),
	)
}

const oneOfTwo: TempoSignature.ConfigurableAccountConfig = {
	salt,
	version: 0n,
	threshold: 1,
	owners: sortOwners([
		{ owner: passkeyOwner, weight: 1 },
		{ owner: slhOwner, weight: 1 },
	]),
}

describe('SLH-DSA vector (rust-pq, FIPS 205)', () => {
	it('decodes the approval and derives its owner', () => {
		const approval = TempoSignature.decodePrimitive(
			vector.encodedApproval as Hex.Hex,
		)
		expect(approval.type).toBe('slhDsa')
		if (approval.type !== 'slhDsa') return
		expect(approval.size).toBe(vector.encodedLength)
		expect(approval.publicKey).toBe(vector.publicKey)
		expect(Hex.size(approval.signature)).toBe(7_856)
		expect(
			TempoSignature.slhDsaAddress(approval.paramId, approval.publicKey),
		).toBe(slhOwner)
	})

	it('prices param_id || pk || sig as calldata, without the type byte', () => {
		const approval = TempoSignature.decodePrimitive(
			vector.encodedApproval as Hex.Hex,
		)
		expect(TempoGas.primitiveDataGas(approval)).toBe(
			vector.calldataGasAfterTypeByte,
		)
		expect(TempoGas.primitiveVerifyGas(approval)).toBe(87_000)
	})
})

describe('configurable-account gas (node worked examples)', () => {
	const account = TempoSignature.deriveConfigurableAccount(oneOfTwo)

	it('derives the example account', () => {
		expect(account).toBe(
			Address.checksum('0x417d77216FDEC848C5a7AA46215E937dF0D8831f'),
		)
	})

	it('charges V - 3,000 for one SLH-DSA approval on a registered 1-of-2 account', () => {
		const signature = TempoSignature.decode(
			configurable(account, oneOfTwo, [vector.encodedApproval as Hex.Hex]),
		)
		expect(signature.type).toBe('configurable')
		expect(signature.size).toBe(8_005)
		const gas = TempoGas.signatureGas(signature)
		expect(gas?.witness).toBe(1_680)
		expect(gas?.hashes).toBe(54 + 48)
		expect(gas?.approvals).toEqual([{ verify: 87_000, data: 125_912 }])
		expect(gas?.total).toBe(211_694)
	})

	it('adds the derivation hash and registration log when registering', () => {
		const registration = TempoGas.registrationGas(oneOfTwo, {
			createsAccount: false,
		})
		expect(registration.derivation).toBe(54)
		expect(registration.log).toBe(3_429)
		expect(registration.commitment).toBe(250_000)
	})

	it('charges V - 3,000 under the quantum-only config', () => {
		const quantumOnly = {
			...oneOfTwo,
			version: 1n,
			owners: [{ owner: slhOwner, weight: 1 }],
		}
		const signature = TempoSignature.decode(
			configurable(account, quantumOnly, [vector.encodedApproval as Hex.Hex]),
		)
		const gas = TempoGas.signatureGas(signature)
		expect(gas?.witness).toBe(1_312)
		expect(gas?.total).toBe(211_320)
	})
})

describe('configurable account view', () => {
	const update = (
		version: bigint,
		owners: TempoSignature.ConfigurableAccountOwner[],
	): ConfigUpdate => ({
		account: Address.checksum('0x417d77216FDEC848C5a7AA46215E937dF0D8831f'),
		salt,
		version,
		threshold: 1,
		owners,
		kind: version === 0n ? 'registered' : 'updated',
		blockNumber: version + 1n,
		transactionHash: Hex.padLeft(Hex.fromNumber(version), 32),
		logIndex: 0,
	})
	const kinds = new Map([
		[passkeyOwner.toLowerCase(), 'webAuthn' as const],
		[slhOwner.toLowerCase(), 'slhDsa' as const],
	])

	it('is quantum-only once every owner is a known SLH-DSA key', () => {
		const registered = update(0n, oneOfTwo.owners)
		const before = configurableAccountView([registered], kinds)
		expect(before?.quantumOnly).toBe(false)
		const after = configurableAccountView(
			[registered, update(1n, [{ owner: slhOwner, weight: 1 }])],
			kinds,
		)
		expect(after?.current.version).toBe(1n)
		expect(after?.history).toHaveLength(2)
		expect(after?.owners).toEqual([
			{ owner: slhOwner, weight: 1, kind: 'slhDsa' },
		])
		expect(after?.quantumOnly).toBe(true)
	})

	it('is not quantum-only while an owner key type is unknown', () => {
		const view = configurableAccountView(
			[update(1n, [{ owner: slhOwner, weight: 1 }])],
			new Map(),
		)
		expect(view?.quantumOnly).toBe(false)
	})
})

describe('RPC transactions with an SLH-DSA approval', () => {
	// eth_getTransactionByHash returns a configurable signature without its 0x05 type byte.
	const rpcSignature = (approvals: Hex.Hex[]) =>
		Hex.slice(
			configurable(
				TempoSignature.deriveConfigurableAccount(oneOfTwo),
				oneOfTwo,
				approvals,
			),
			1,
		)

	it('keeps the transaction and drops only the signature ox cannot decode', () => {
		const transaction = {
			hash: `0x${'11'.repeat(32)}`,
			signature: rpcSignature([vector.encodedApproval as Hex.Hex]),
		}
		expect(hasDecodableSignature(transaction)).toBe(false)
		expect(withoutUndecodableSignature(transaction)).toEqual({
			hash: transaction.hash,
			signature: undefined,
		})
	})

	it('leaves other transactions unchanged', () => {
		const unsigned = { hash: `0x${'22'.repeat(32)}` }
		expect(withoutUndecodableSignature(unsigned)).toBe(unsigned)
		expect(withoutUndecodableSignature('0xabc')).toBe('0xabc')
	})
})
