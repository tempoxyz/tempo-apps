import * as React from 'react'
import { copyFeedbackEvent } from '#lib/clipboard'

/** One accessible failure message for both shared and custom copy controls. */
export function CopyFeedback(): React.JSX.Element | null {
	const [failure, setFailure] = React.useState<number | null>(null)
	const sequence = React.useRef(0)
	React.useEffect(() => {
		const onFeedback = (event: Event) => {
			if (event instanceof CustomEvent && typeof event.detail === 'boolean')
				setFailure(event.detail ? ++sequence.current : null)
		}
		window.addEventListener(copyFeedbackEvent, onFeedback)
		return () => window.removeEventListener(copyFeedbackEvent, onFeedback)
	}, [])

	if (failure === null) return null
	return (
		<div
			key={failure}
			className="fixed bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4 rounded-lg border border-negative bg-surface px-4 py-3 text-sm shadow-lg"
			role="alert"
		>
			<p>Could not copy. Try copying again.</p>
			<button
				type="button"
				className="shrink-0 underline underline-offset-2"
				onClick={() => setFailure(null)}
				aria-label="Dismiss copy error"
			>
				Dismiss
			</button>
		</div>
	)
}
