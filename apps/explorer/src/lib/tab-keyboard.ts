import type * as React from 'react'

/** Automatically activate horizontal tabs, skipping disabled tabs. */
export function handleTabKeyDown(
	event: React.KeyboardEvent<HTMLButtonElement>,
): void {
	const tabs = Array.from(
		event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
			'[role="tab"]:not(:disabled)',
		) ?? [],
	)
	const index = tabs.indexOf(event.currentTarget)
	if (index < 0) return
	let next: number
	switch (event.key) {
		case 'ArrowRight':
			next = (index + 1) % tabs.length
			break
		case 'ArrowLeft':
			next = (index - 1 + tabs.length) % tabs.length
			break
		case 'Home':
			next = 0
			break
		case 'End':
			next = tabs.length - 1
			break
		default:
			return
	}
	event.preventDefault()
	tabs[next].focus()
	tabs[next].click()
}
