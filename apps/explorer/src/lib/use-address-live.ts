import * as React from 'react'
import type { EnrichedTransaction } from './server/address-history'
import type {
	AccountTransfersApiResponse,
	TokenTransfersApiResponse,
} from './server/token'

export type LiveRows =
	| { kind: 'transactions'; rows: EnrichedTransaction[] }
	| { kind: 'token-transfers'; rows: TokenTransfersApiResponse['transfers'] }
	| {
			kind: 'account-transfers'
			rows: AccountTransfersApiResponse['transfers']
	  }

export function useAddressLive(
	url: string,
	enabled: boolean,
	onRows: (data: LiveRows) => void,
	stop: () => void,
) {
	const callbacks = React.useRef({ onRows, stop })
	React.useEffect(() => {
		callbacks.current = { onRows, stop }
	}, [onRows, stop])
	const [error, setError] = React.useState<string | null>(null)
	React.useEffect(() => {
		if (!enabled) return
		setError(null)
		let source: EventSource | undefined
		let retry: ReturnType<typeof setTimeout> | undefined
		let retries = 0
		let disposed = false
		const reconnect = () => {
			source?.close()
			if (disposed || retry) return
			if (++retries > 3) {
				setError('Live updates paused. Try again.')
				callbacks.current.stop()
				return
			}
			retry = setTimeout(
				() => {
					retry = undefined
					connect()
				},
				1_000 * 2 ** (retries - 1),
			)
		}
		const connect = () => {
			if (disposed) return
			source = new EventSource(url)
			source.addEventListener('rows', (event) => {
				try {
					callbacks.current.onRows(
						JSON.parse((event as MessageEvent).data) as LiveRows,
					)
				} catch {
					reconnect()
				}
			})
			source.addEventListener('feed-error', reconnect)
			source.addEventListener('end', reconnect)
			source.onerror = reconnect
		}
		connect()
		return () => {
			disposed = true
			source?.close()
			clearTimeout(retry)
		}
	}, [url, enabled])
	return error
}
