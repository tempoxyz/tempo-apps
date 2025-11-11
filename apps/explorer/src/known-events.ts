import { type Address, Hex } from 'ox'
import { Abis } from 'tempo.ts/viem'
import type { TransactionReceipt } from 'viem'
import { parseEventLogs } from 'viem'

const abi = Object.values(Abis).flat()

type Amount = {
	decimals?: number
	token: Address.Address
	value: bigint
}

type Token = {
	address: Address.Address
	symbol?: string
}

export type KnownEventPart =
	| { type: 'account'; value: Address.Address }
	| { type: 'action'; value: string }
	| { type: 'amount'; value: Amount }
	| { type: 'hex'; value: Hex.Hex }
	| { type: 'primary'; value: string }
	| { type: 'secondary'; value: string }
	| { type: 'tick'; value: number }
	| { type: 'token'; value: Token }

export interface KnownEvent {
	type: string
	parts: KnownEventPart[]
	note?: string
}

export function parseKnownEvents(receipt: TransactionReceipt): KnownEvent[] {
	const { logs } = receipt
	const events = parseEventLogs({ abi, logs })

	const preferenceMap = new Map<string, string>()

	for (const event of events) {
		let key: string | undefined

		// `TransferWithMemo` and `Transfer` events are paired with each other,
		// we will need to take preference on `TransferWithMemo` for those instances.
		if (event.eventName === 'TransferWithMemo') {
			const [_, from, to] = event.topics
			key = `${from}${to}`
		}

		// `Mint` and `Transfer` events are paired with each other,
		// we will need to take preference on `Mint` for those instances.
		if (event.eventName === 'Mint') {
			const [_, to] = event.topics
			key = `${event.address}${event.data}${to}`
		}

		// `Burn` and `Transfer` events are paired with each other,
		// we will need to take preference on `Burn` for those instances.
		if (event.eventName === 'Burn') {
			const [_, from] = event.topics
			key = `${event.address}${event.data}${from}`
		}

		if (key) preferenceMap.set(key, event.eventName)
	}

	const dedupedEvents = events.filter((event) => {
		let include = true

		if (event.eventName === 'Transfer') {
			{
				// Check TransferWithMemo dedup
				const [_, from, to] = event.topics
				const key = `${from}${to}`
				if (preferenceMap.get(key)?.includes('TransferWithMemo'))
					include = false
			}

			{
				// Check Mint dedup
				const [_, __, to] = event.topics
				const key = `${event.address}${event.data}${to}`
				if (preferenceMap.get(key)?.includes('Mint')) include = false
			}

			{
				// Check Burn dedup
				const [_, from] = event.topics
				const key = `${event.address}${event.data}${from}`
				if (preferenceMap.get(key)?.includes('Burn')) include = false
			}
		}

		return include
	})

	const knownEvents: KnownEvent[] = []

	// Map log events to known events.
	for (const event of dedupedEvents) {
		switch (event.eventName) {
			case 'TransferWithMemo':
			case 'Transfer': {
				const { amount, to } = event.args
				const isFee = to.toLowerCase().startsWith('0xfeec00000')
				if (isFee) break

				const memo =
					'memo' in event.args
						? Hex.toString(Hex.trimLeft(event.args.memo))
						: undefined

				knownEvents.push({
					type: 'send',
					note: memo,
					parts: [
						{ type: 'action', value: 'Send' },
						{
							type: 'amount',
							value: {
								value: amount,
								token: event.address,
							},
						},
						{ type: 'secondary', value: 'to' },
						{ type: 'account', value: to },
					],
				})
				break
			}

			case 'Mint': {
				if ('amount' in event.args) {
					const { amount, to } = event.args

					knownEvents.push({
						type: 'mint',
						parts: [
							{ type: 'action', value: 'Mint' },
							{
								type: 'amount',
								value: {
									value: amount,
									token: event.address,
								},
							},
							{ type: 'secondary', value: 'to' },
							{ type: 'account', value: to },
						],
					})
					break
				}

				break
			}

			case 'Burn': {
				if ('amount' in event.args) {
					const { amount, from } = event.args

					knownEvents.push({
						type: 'burn',
						parts: [
							{ type: 'action', value: 'Burn' },
							{
								type: 'amount',
								value: {
									value: amount,
									token: event.address,
								},
							},
							{ type: 'secondary', value: 'from' },
							{ type: 'account', value: from },
						],
					})
					break
				}

				break
			}

			case 'TokenCreated': {
				const { symbol } = event.args
				knownEvents.push({
					type: 'create token',
					parts: [
						{ type: 'action', value: 'Create Token' },
						{ type: 'token', value: { address: event.address, symbol } },
					],
				})
				break
			}

			case 'RoleMembershipUpdated': {
				const { account, hasRole, role } = event.args
				knownEvents.push({
					type: hasRole ? 'grant role' : 'revoke role',
					parts: [
						{ type: 'action', value: hasRole ? 'Grant Role' : 'Revoke Role' },
						{ type: 'hex', value: role },
						{ type: 'secondary', value: 'to' },
						{ type: 'account', value: account },
					],
				})
				break
			}
		}
	}

	return knownEvents
}
