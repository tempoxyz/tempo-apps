import { keccak256 } from 'viem'
import type { KnownEvent } from './known-events'

export function isZoneBatchEvent(event: KnownEvent): boolean {
	return (
		event.type === 'zone batch submission' ||
		event.type === 'zone batch submitted'
	)
}

function batchKey(event: KnownEvent): string | undefined {
	const batch = event.meta?.zoneBatch
	if (!batch || event.failed) return
	const fields = [
		batch.portal,
		batch.nextBlockHash,
		batch.nextProcessedDepositQueueHash,
		batch.withdrawalQueueHash,
	]
	if (fields.some((value) => typeof value !== 'string')) return
	return fields.map((value) => value.toLowerCase()).join(':')
}

/** Logs anchor executed actions. Calldata enriches only an unambiguous match. */
export function composeCallAndLogEvents(
	events: readonly KnownEvent[],
	calls: readonly KnownEvent[],
): { events: KnownEvent[]; unmatchedCalls: KnownEvent[] } {
	// Older callers may already have prepended these same call objects.
	const logs = events.filter((event) => {
		if (calls.includes(event)) return false
		// A generic calldata fallback is another description of the same call,
		// not an emitted effect. Keep it if that exact call was not decoded.
		if (event.type !== 'contract call') return true
		const part = event.parts.find((part) => part.type === 'contractCall')
		if (!part || part.type !== 'contractCall') return true
		return !calls.some((call) =>
			call.evidence?.some(
				(source) =>
					source.kind === 'call' &&
					source.address.toLowerCase() === part.value.address.toLowerCase() &&
					source.inputHash === keccak256(part.value.input),
			),
		)
	})
	const consumed = new Set<KnownEvent>()
	const enriched = logs.map((event) => {
		if (!event.evidence?.some((source) => source.kind === 'log')) return event
		const key = batchKey(event)
		if (!key) return event
		const matchingCalls = calls.filter((call) => batchKey(call) === key)
		if (
			matchingCalls.length !== 1 ||
			logs.filter((log) => batchKey(log) === key).length !== 1
		)
			return event
		const call = matchingCalls[0]
		consumed.add(call)
		const logNotes = Array.isArray(event.note) ? event.note : []
		const callNotes = Array.isArray(call.note) ? call.note : []
		const labels = new Set(logNotes.map(([label]) => label))
		return {
			...event,
			note: [...logNotes, ...callNotes.filter(([label]) => !labels.has(label))],
			evidence: [...(event.evidence ?? []), ...(call.evidence ?? [])],
		}
	})
	const unmatchedCalls = calls.filter((call) => !consumed.has(call))
	return { events: [...unmatchedCalls, ...enriched], unmatchedCalls }
}
