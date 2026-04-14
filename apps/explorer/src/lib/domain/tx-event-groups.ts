import type { Log } from 'viem'
import { toEventSelector } from 'viem'
import type { KnownEvent } from '#lib/domain/known-events'

export type EventGroup = {
	logs: Log[]
	startIndex: number
	knownEvent: KnownEvent | null
}

const eventSignatures = {
	Transfer: toEventSelector(
		'event Transfer(address indexed, address indexed, uint256)',
	),
	TransferWithMemo: toEventSelector(
		'event TransferWithMemo(address indexed, address indexed, uint256, bytes32 indexed)',
	),
	Mint: toEventSelector('event Mint(address indexed, uint256)'),
	Burn: toEventSelector('event Burn(address indexed, uint256)'),
	DepositMade: toEventSelector(
		'event DepositMade(bytes32 indexed, address indexed, address, address, uint128, uint128, bytes32)',
	),
	EncryptedDepositMade: toEventSelector(
		'event EncryptedDepositMade(bytes32 indexed, address indexed, address, uint128, uint128, bytes32)',
	),
	WithdrawalProcessed: toEventSelector(
		'event WithdrawalProcessed(address indexed, address, uint128, bool)',
	),
} as const

export function getEventName(log: Log): string | null {
	const topic0 = log.topics[0]?.toLowerCase()
	if (topic0 === eventSignatures.Transfer.toLowerCase()) return 'Transfer'
	if (topic0 === eventSignatures.TransferWithMemo.toLowerCase())
		return 'TransferWithMemo'
	if (topic0 === eventSignatures.Mint.toLowerCase()) return 'Mint'
	if (topic0 === eventSignatures.Burn.toLowerCase()) return 'Burn'
	if (topic0 === eventSignatures.DepositMade.toLowerCase()) return 'DepositMade'
	if (topic0 === eventSignatures.EncryptedDepositMade.toLowerCase())
		return 'EncryptedDepositMade'
	if (topic0 === eventSignatures.WithdrawalProcessed.toLowerCase())
		return 'WithdrawalProcessed'
	return null
}

export function groupRelatedEvents(
	logs: Log[],
	knownEvents: (KnownEvent | null)[],
): EventGroup[] {
	const groups: EventGroup[] = []
	let i = 0

	while (i < logs.length) {
		const log = logs[i]
		const event = knownEvents[i]

		if (event?.type === 'hidden') {
			i++
			continue
		}

		const eventName = getEventName(log)

		if (eventName === 'Transfer' || eventName === 'TransferWithMemo') {
			const secondLog = logs[i + 1]
			const secondEventName = secondLog ? getEventName(secondLog) : null

			if (secondEventName === 'Mint' || secondEventName === 'Burn') {
				const thirdLog = logs[i + 2]
				const thirdEventName = thirdLog ? getEventName(thirdLog) : null

				if (eventName === 'Transfer' && thirdEventName === 'TransferWithMemo') {
					groups.push({
						logs: [log, secondLog, thirdLog],
						startIndex: i,
						knownEvent: knownEvents[i + 1],
					})
					i += 3
					continue
				}

				groups.push({
					logs: [log, secondLog],
					startIndex: i,
					knownEvent: knownEvents[i + 1],
				})
				i += 2
				continue
			}

			if (eventName === 'Transfer' && secondEventName === 'TransferWithMemo') {
				groups.push({
					logs: [log, secondLog],
					startIndex: i,
					knownEvent: knownEvents[i + 1],
				})
				i += 2
				continue
			}

			if (
				secondEventName === 'DepositMade' ||
				secondEventName === 'EncryptedDepositMade' ||
				secondEventName === 'WithdrawalProcessed'
			) {
				groups.push({
					logs: [log, secondLog],
					startIndex: i,
					knownEvent: knownEvents[i + 1],
				})
				i += 2
				continue
			}
		}

		groups.push({
			logs: [log],
			startIndex: i,
			knownEvent: event,
		})
		i++
	}

	return groups
}
