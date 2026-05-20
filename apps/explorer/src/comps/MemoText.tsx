import meowThumbsupUrl from '#assets/emoji/meowthumbsup.png'

const EMOJI_BY_SHORTCODE = {
	meowthumbsup: meowThumbsupUrl,
} as const

const shortcodePattern = /:([a-z0-9_+-]+):/gi

export function MemoText(props: { value: string }) {
	const parts: Array<string | { shortcode: string; url: string }> = []
	let lastIndex = 0

	for (const match of props.value.matchAll(shortcodePattern)) {
		const shortcode = match[1]?.toLowerCase()
		const url = shortcode
			? EMOJI_BY_SHORTCODE[shortcode as keyof typeof EMOJI_BY_SHORTCODE]
			: undefined

		if (!url) continue

		if (match.index > lastIndex) {
			parts.push(props.value.slice(lastIndex, match.index))
		}

		parts.push({ shortcode: `:${shortcode}:`, url })
		lastIndex = match.index + match[0].length
	}

	if (lastIndex === 0) return props.value

	if (lastIndex < props.value.length) parts.push(props.value.slice(lastIndex))

	return (
		<>
			{parts.map((part, index) =>
				typeof part === 'string' ? (
					part
				) : (
					<img
						key={`${part.shortcode}-${index}`}
						alt={part.shortcode}
						src={part.url}
						title={part.shortcode}
						className="inline-block size-[18px] align-[-4px]"
					/>
				),
			)}
		</>
	)
}
