// Shared by every copy control; the event contains no clipboard contents.
export const copyFeedbackEvent = 'explorer:copy-feedback'

let latestFeedback = 0

function createCopyFeedback() {
	let current = 0
	return (failed: boolean) => {
		if (!failed) current = ++latestFeedback
		// A slow failure from another control must not replace a newer copy result.
		if (current === latestFeedback)
			window.dispatchEvent(
				new CustomEvent(copyFeedbackEvent, { detail: failed }),
			)
	}
}

export function createCopyController(
	writeText = (value: string) => navigator.clipboard.writeText(value),
	feedback = createCopyFeedback(),
) {
	let notifying = false
	let attempt = 0
	let timer: ReturnType<typeof setTimeout> | undefined
	const listeners = new Set<() => void>()
	const update = (value: boolean) => {
		notifying = value
		for (const listener of listeners) listener()
	}
	const cancel = () => {
		attempt++
		clearTimeout(timer)
		timer = undefined
		update(false)
	}

	return {
		getSnapshot: () => notifying,
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		cancel,
		async copy(value: string, timeout = 800): Promise<void> {
			cancel()
			const current = attempt
			feedback(false)
			try {
				await writeText(value)
			} catch {
				if (current === attempt) feedback(true)
				return
			}
			if (current !== attempt) return
			update(true)
			timer = setTimeout(() => update(false), timeout)
		},
	}
}
