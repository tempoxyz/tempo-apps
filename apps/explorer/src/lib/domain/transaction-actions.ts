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

// A repeated key is ambiguous, even if the same object appears twice.
function uniqueBatches(events: readonly KnownEvent[]) {
	const unique = new Map<string, KnownEvent | null>()
	for (const event of events) {
		const key = batchKey(event)
		if (key) unique.set(key, unique.has(key) ? null : event)
	}
	return unique
}

/** Logs anchor executed actions. Calldata enriches only an unambiguous match. */
export function composeCallAndLogEvents(
	events: readonly KnownEvent[],
	calls: readonly KnownEvent[],
): { events: KnownEvent[]; unmatchedCalls: KnownEvent[] } {
	if (!calls.length) return { events: [...events], unmatchedCalls: [] }
	const decodedCalls = new Set(calls)
	const inputHashes = new Map<string, Set<string>>()
	for (const call of calls) {
		for (const source of call.evidence ?? []) {
			if (source.kind !== 'call' || !source.inputHash) continue
			const address = source.address.toLowerCase()
			const hashes = inputHashes.get(address)
			if (hashes) hashes.add(source.inputHash)
			else inputHashes.set(address, new Set([source.inputHash]))
		}
	}
	// Older callers may already have prepended these same call objects.
	const logs = events.filter((event) => {
		if (decodedCalls.has(event)) return false
		// A generic calldata fallback is another description of the same call,
		// not an emitted effect. Keep it if that exact call was not decoded.
		if (event.type !== 'contract call') return true
		const part = event.parts.find((part) => part.type === 'contractCall')
		if (!part || part.type !== 'contractCall') return true
		const hashes = inputHashes.get(part.value.address.toLowerCase())
		return !hashes?.has(keccak256(part.value.input))
	})
	const callsByBatch = uniqueBatches(calls)
	if (!callsByBatch.size)
		return { events: [...calls, ...logs], unmatchedCalls: [...calls] }
	const logsByBatch = uniqueBatches(logs)
	const consumed = new Set<KnownEvent>()
	const enriched = logs.map((event) => {
		if (!event.evidence?.some((source) => source.kind === 'log')) return event
		const key = batchKey(event)
		if (!key || logsByBatch.get(key) !== event) return event
		const call = callsByBatch.get(key)
		if (!call) return event
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
