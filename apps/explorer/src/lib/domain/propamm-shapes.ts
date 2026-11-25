import type { Address, Log } from 'viem'
import { parseAbi } from 'viem'
import { readContract } from 'wagmi/actions'
import {
	decodeHotWord,
	decodeShapeSide,
	findPropAmmV2Pair,
	propAmmPostedSelector,
	type PropAmmShape,
} from '#lib/propamm'
import { getWagmiConfig } from '#wagmi.config.ts'

const venueAbi = parseAbi([
	'function shape(uint16 pairIndex, uint8 shapeId) view returns (uint256[4] words)',
	'function pair(uint16 pairIndex) view returns ((address base, address quote, uint64 sizeUnit, uint8 access, address hook, uint8 hookFlags))',
])

export type GetPropAmmShapeFn = (
	venue: Address,
	pairIndex: number,
	shapeId: number,
) => PropAmmShape | undefined

const shapeKey = (venue: string, pairIndex: number, shapeId: number) =>
	`${venue.toLowerCase()}:${pairIndex}:${shapeId}`

/**
 * The ladders the listed v2 venues' `Posted` logs quote on, read from the
 * venue at the transaction's block. A hot word only carries a shape ID: the
 * shape's level spreads set the real bid and ask.
 */
export async function propAmmShapesFromLogs(
	chainId: number | undefined,
	logs: readonly Log[],
	blockNumber?: bigint | null,
): Promise<GetPropAmmShapeFn> {
	const wanted = new Map<
		string,
		{ venue: Address; pairIndex: number; shapeId: number }
	>()
	for (const log of logs) {
		const [selector, pairTopic] = log.topics
		if (selector?.toLowerCase() !== propAmmPostedSelector || !pairTopic)
			continue
		const pairIndex = Number(BigInt(pairTopic))
		if (!findPropAmmV2Pair(chainId, log.address, pairIndex)) continue
		const { shapeId } = decodeHotWord(BigInt(log.data.slice(0, 66)))
		wanted.set(shapeKey(log.address, pairIndex, shapeId), {
			venue: log.address,
			pairIndex,
			shapeId,
		})
	}
	if (wanted.size === 0) return () => undefined

	const config = getWagmiConfig()
	const at = blockNumber ? { blockNumber } : {}
	const entries = await Promise.all(
		[...wanted].map(async ([key, { venue, pairIndex, shapeId }]) => {
			try {
				const [words, pair] = await Promise.all([
					readContract(config, {
						address: venue,
						abi: venueAbi,
						functionName: 'shape',
						args: [pairIndex, shapeId],
						...at,
					}),
					readContract(config, {
						address: venue,
						abi: venueAbi,
						functionName: 'pair',
						args: [pairIndex],
						...at,
					}),
				])
				const shape: PropAmmShape = {
					bids: decodeShapeSide(words[0], words[1]),
					asks: decodeShapeSide(words[2], words[3]),
					sizeUnit: pair.sizeUnit,
				}
				return [key, shape] as const
			} catch {
				return [key, undefined] as const
			}
		}),
	)
	const shapes = new Map(entries)
	return (venue, pairIndex, shapeId) =>
		shapes.get(shapeKey(venue, pairIndex, shapeId))
}
