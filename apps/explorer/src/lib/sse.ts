/** Read SSE frames without assuming network chunks align with events. */
export async function* readSse(body: ReadableStream<Uint8Array>) {
	const reader = body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	try {
		while (true) {
			const { value, done } = await reader.read()
			buffer += done
				? decoder.decode()
				: decoder.decode(value, { stream: true })
			while (true) {
				const match = /\r?\n\r?\n/.exec(buffer)
				if (!match) break
				const frame = buffer.slice(0, match.index)
				buffer = buffer.slice(match.index + match[0].length)
				let event = 'message'
				const data: string[] = []
				for (const line of frame.split(/\r?\n/)) {
					if (line.startsWith('event:')) event = line.slice(6).trim()
					if (line.startsWith('data:'))
						data.push(line.slice(5).replace(/^ /, ''))
				}
				if (data.length) yield { event, data: data.join('\n') }
			}
			if (done) break
		}
	} finally {
		await reader.cancel().catch(() => {})
		reader.releaseLock()
	}
}

export function mergeLiveRows<
	T extends {
		blockNumber: string
		transactionIndex?: number | undefined
		id?: string | undefined
	},
>(previous: T[], incoming: T[], key: (row: T) => string, limit: number): T[] {
	const rows = new Map<string, T>()
	for (const row of [...incoming, ...previous])
		if (!rows.has(key(row))) rows.set(key(row), row)
	return [...rows.values()]
		.sort((a, b) => {
			const blockA = BigInt(a.blockNumber),
				blockB = BigInt(b.blockNumber)
			if (blockA !== blockB) return blockA > blockB ? -1 : 1
			const position = (row: T) =>
				row.transactionIndex ?? Number(row.id?.split('-').at(-1) ?? 0)
			return position(b) - position(a)
		})
		.slice(0, limit)
}
