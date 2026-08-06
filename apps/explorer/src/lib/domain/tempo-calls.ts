import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { Log } from 'viem'
import { toEventSelector } from 'viem'
import { Addresses } from 'viem/tempo'

const transferSelectors = new Set([
	toEventSelector('Transfer(address,address,uint256)'),
	toEventSelector('TransferWithMemo(address,address,uint256,bytes32)'),
])

export type TempoBatchCall = {
	to: Address.Address
	data: Hex.Hex
	value: bigint
}

export function normalizeTempoBatchCall(value: unknown): TempoBatchCall | null {
	if (!value || typeof value !== 'object') return null
	const call = value as {
		to?: unknown
		data?: unknown
		input?: unknown
		value?: unknown
	}
	if (typeof call.to !== 'string' || !Address.validate(call.to)) return null
	const callData = call.data ?? call.input
	const data =
		typeof callData === 'string' && Hex.validate(callData)
			? (callData as Hex.Hex)
			: '0x'
	let amount = 0n
	try {
		amount = BigInt(typeof call.value === 'string' ? call.value : 0)
	} catch {}
	return { to: Address.from(call.to), data, value: amount }
}

export function withoutFeeTransferLogs<T extends Log>(logs: T[]): T[] {
	return logs.filter((log) => {
		if (!log.topics[0] || !transferSelectors.has(log.topics[0])) return true
		const toTopic = log.topics[2]
		if (!toTopic) return true
		return !Address.isEqual(
			Address.from(`0x${toTopic.slice(-40)}`),
			Addresses.feeManager,
		)
	})
}

export function countTransferBalanceChanges(logs: Log[]): number {
	const changes = new Set<string>()
	for (const log of withoutFeeTransferLogs(logs)) {
		if (log.topics[0] !== toEventSelector('Transfer(address,address,uint256)'))
			continue
		const from = log.topics[1]?.slice(-40)
		const to = log.topics[2]?.slice(-40)
		if (from && !/^0+$/.test(from)) changes.add(`${from}:${log.address}`)
		if (to && !/^0+$/.test(to)) changes.add(`${to}:${log.address}`)
	}
	return changes.size
}
