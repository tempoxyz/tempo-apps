import type { FromWorker, ToWorker } from './miner.protocol'

export type MinerState =
	| { status: 'idle' }
	| {
			status: 'mining'
			totalAttempts: number
			hashesPerSecond: number
			workerCount: number
	  }
	| {
			status: 'found'
			salt: string
			masterId: string
			hash: string
			attempts: number
			minedForAddress: string
	  }
	| { status: 'error'; message: string }

export type MinerPoolOptions = {
	masterAddress: string
	workerCount?: number
	onStateChange: (state: MinerState) => void
}

export function createMinerPool(options: MinerPoolOptions) {
	const { masterAddress, onStateChange } = options
	const workerCount =
		options.workerCount ??
		Math.max(1, Math.min(8, (navigator.hardwareConcurrency ?? 4) - 1))

	const workers: Worker[] = []
	const workerAttempts = new Map<number, number>()
	const workerHps = new Map<number, number>()
	let stopped = false

	// Random 24-byte seed shared across workers
	const seedBytes = new Uint8Array(24)
	crypto.getRandomValues(seedBytes)
	const seedHex = `0x${Array.from(seedBytes, (b) => b.toString(16).padStart(2, '0')).join('')}`

	const batchSize = 100_000

	function aggregateProgress() {
		let total = 0
		let hps = 0
		for (const a of workerAttempts.values()) total += a
		for (const h of workerHps.values()) hps += h
		return { total, hps }
	}

	function start() {
		stopped = false

		onStateChange({
			status: 'mining',
			totalAttempts: 0,
			hashesPerSecond: 0,
			workerCount,
		})

		for (let i = 0; i < workerCount; i++) {
			const worker = new Worker(new URL('./miner.worker.ts', import.meta.url), {
				type: 'module',
			})

			worker.onmessage = (e: MessageEvent<FromWorker>) => {
				const msg = e.data
				if (stopped && msg.type !== 'stopped') return

				switch (msg.type) {
					case 'ready': {
						break
					}
					case 'progress': {
						workerAttempts.set(msg.workerId, msg.attempts)
						workerHps.set(msg.workerId, msg.hashesPerSecond)
						const { total, hps } = aggregateProgress()
						onStateChange({
							status: 'mining',
							totalAttempts: total,
							hashesPerSecond: hps,
							workerCount,
						})
						break
					}
					case 'found': {
						stopped = true
						onStateChange({
							status: 'found',
							salt: msg.saltHex,
							masterId: msg.masterIdHex,
							hash: msg.hashHex,
							attempts: msg.attempts,
							minedForAddress: masterAddress,
						})
						// Stop all other workers
						for (const w of workers) {
							w.postMessage({ type: 'stop' } satisfies ToWorker)
						}
						setTimeout(() => {
							for (const w of workers) w.terminate()
						}, 100)
						break
					}
					case 'error': {
						onStateChange({ status: 'error', message: msg.message })
						break
					}
				}
			}

			worker.onerror = (err) => {
				if (stopped) return
				onStateChange({ status: 'error', message: err.message })
			}

			const startMsg: ToWorker = {
				type: 'start',
				workerId: i,
				masterAddress,
				seedHex,
				startCounter: i,
				stride: workerCount,
				batchSize,
			}
			worker.postMessage(startMsg)
			workers.push(worker)
		}
	}

	function stop() {
		stopped = true
		for (const w of workers) {
			w.postMessage({ type: 'stop' } satisfies ToWorker)
		}
		setTimeout(() => {
			for (const w of workers) w.terminate()
		}, 100)
		onStateChange({ status: 'idle' })
	}

	return { start, stop, workerCount }
}
