import * as React from 'react'
import { liveFeedSecondsLeft } from './live-feed'

/** A live session belongs to one address, tab, page, and set of filters. */
export function useLiveFeed(
	scope: string,
	eligible: boolean,
	initialLive = false,
) {
	const [session, setSession] = React.useState<{
		scope: string
		deadline: number
	} | null>(null)
	const [now, setNow] = React.useState(0)
	const initialized = React.useRef(false)
	const stop = React.useCallback(() => setSession(null), [])
	const start = React.useCallback(() => {
		if (!eligible || document.visibilityState !== 'visible') return
		const now = Date.now()
		setNow(now)
		setSession({ scope, deadline: now + 120_000 })
	}, [scope, eligible])
	React.useEffect(() => {
		if (initialized.current) return
		initialized.current = true
		if (initialLive) start()
	}, [initialLive, start])
	const secondsLeft = liveFeedSecondsLeft(session, scope, eligible, now)
	const live = secondsLeft > 0
	React.useEffect(() => {
		if (!session) return
		if (!live) {
			stop()
			return
		}
		const tick = () => {
			const now = Date.now()
			setNow(now)
			if (now >= session.deadline) stop()
		}
		const hide = () => {
			if (document.visibilityState !== 'visible') stop()
		}
		const timer = window.setInterval(tick, 1_000)
		document.addEventListener('visibilitychange', hide)
		window.addEventListener('pagehide', stop)
		return () => {
			window.clearInterval(timer)
			document.removeEventListener('visibilitychange', hide)
			window.removeEventListener('pagehide', stop)
		}
	}, [session, live, stop])
	return { live, start, stop }
}
