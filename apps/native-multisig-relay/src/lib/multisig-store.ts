import type { Address, Hex } from 'viem'

const KV_PREFIX = 'native-multisig-operation:'

type MultisigConfig = {
	threshold: number
	owners: readonly {
		owner: Address
		weight: number
	}[]
}

type MultisigEntry = {
	account: Address
	chainId: number
	config?: MultisigConfig | undefined
	createdAt: number
	genesisConfigId: Hex
	id: Hex
	payload: Hex
	signatures: readonly Hex[]
	submittedHash?: Hex | undefined
	transaction: Hex
	updatedAt: number
}

type MultisigStore = {
	delete: (id: Hex) => Promise<void>
	get: (id: Hex) => Promise<MultisigEntry | undefined>
	listPendingByAddress: (address: Address) => Promise<readonly MultisigEntry[]>
	set: (entry: MultisigEntry) => Promise<void>
}

export function createMultisigStore(kv: KVNamespace): MultisigStore {
	return {
		async delete(id) {
			await kv.delete(key(id))
		},
		async get(id) {
			return (await kv.get<MultisigEntry>(key(id), 'json')) ?? undefined
		},
		async listPendingByAddress(address) {
			const list = await kv.list({ prefix: KV_PREFIX })
			const entries = await Promise.all(
				list.keys.map((item) => kv.get<MultisigEntry>(item.name, 'json')),
			)
			return entries
				.filter((entry): entry is MultisigEntry => {
					if (!entry) return false
					if (entry.submittedHash) return false
					return entry.account.toLowerCase() === address.toLowerCase()
				})
				.sort((a, b) => a.createdAt - b.createdAt)
		},
		async set(entry) {
			await kv.put(key(entry.id), JSON.stringify(entry))
		},
	}
}

function key(id: Hex) {
	return `${KV_PREFIX}${id.toLowerCase()}`
}
