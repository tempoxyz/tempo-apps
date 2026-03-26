import { useCallback, useEffect, useRef, useState } from 'react'
import { createMinerPool, type MinerState } from './miner.pool'

export function useMiner() {
	const [state, setState] = useState<MinerState>({ status: 'idle' })
	const poolRef = useRef<ReturnType<typeof createMinerPool> | null>(null)

	useEffect(() => {
		return () => {
			poolRef.current?.stop()
			poolRef.current = null
		}
	}, [])

	const start = useCallback((masterAddress: string) => {
		poolRef.current?.stop()
		const pool = createMinerPool({
			masterAddress,
			onStateChange: setState,
		})
		poolRef.current = pool
		pool.start()
	}, [])

	const stop = useCallback(() => {
		poolRef.current?.stop()
		poolRef.current = null
	}, [])

	const reset = useCallback(() => {
		poolRef.current?.stop()
		poolRef.current = null
		setState({ status: 'idle' })
	}, [])

	return { state, start, stop, reset }
}
