import type * as Hex from 'ox/Hex'
import * as OxHex from 'ox/Hex'

const decoder = new TextDecoder('utf-8', { fatal: true })

function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index)
		if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f))
			return true
	}

	return false
}

/**
 * Decodes TransferWithMemo bytes for UI display.
 * Returns undefined for empty/binary payloads to avoid rendering gibberish.
 */
export function decodeMemoForDisplay(memo: Hex.Hex): string | undefined {
	const bytes = OxHex.toBytes(memo)

	let start = 0
	let end = bytes.length

	while (start < end && bytes[start] === 0) start += 1
	while (end > start && bytes[end - 1] === 0) end -= 1

	if (start === end) return undefined

	let decoded: string
	try {
		decoded = decoder.decode(bytes.subarray(start, end))
	} catch {
		return undefined
	}

	const normalized = decoded.replace(/\s+/g, ' ').trim()
	if (!normalized) return undefined

	if (hasControlCharacter(normalized)) return undefined

	return normalized
}
