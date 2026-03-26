import { keccak_256 } from '@noble/hashes/sha3'
import type { ToWorker, FromWorker } from './miner.protocol'

function post(msg: FromWorker) {
	self.postMessage(msg)
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith('0x') ? hex.slice(2) : hex
	const bytes = new Uint8Array(clean.length / 2)
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
	}
	return bytes
}

function bytesToHex(bytes: Uint8Array): string {
	let hex = '0x'
	for (const b of bytes) {
		hex += b.toString(16).padStart(2, '0')
	}
	return hex
}

let running = false

self.onmessage = (e: MessageEvent<ToWorker>) => {
	const msg = e.data

	if (msg.type === 'stop') {
		running = false
		return
	}

	if (msg.type === 'start') {
		running = true
		const {
			workerId,
			masterAddress,
			seedHex,
			startCounter,
			stride,
			batchSize,
		} = msg

		const addrBytes = hexToBytes(masterAddress)
		const seedBytes = hexToBytes(seedHex)

		// Input buffer: 20 bytes address + 32 bytes salt = 52 bytes
		const input = new Uint8Array(52)
		input.set(addrBytes, 0)

		// Salt = 24-byte seed + 8-byte counter
		const salt = new Uint8Array(32)
		salt.set(seedBytes.slice(0, 24), 0)

		let counter = startCounter
		let totalAttempts = 0
		const startTime = performance.now()

		const mine = () => {
			if (!running) {
				post({ type: 'stopped', workerId, attempts: totalAttempts })
				return
			}

			for (let i = 0; i < batchSize; i++) {
				// Write counter into last 8 bytes of salt (big-endian)
				const lo = counter & 0xffffffff
				const hi = (counter / 0x100000000) >>> 0
				salt[24] = (hi >>> 24) & 0xff
				salt[25] = (hi >>> 16) & 0xff
				salt[26] = (hi >>> 8) & 0xff
				salt[27] = hi & 0xff
				salt[28] = (lo >>> 24) & 0xff
				salt[29] = (lo >>> 16) & 0xff
				salt[30] = (lo >>> 8) & 0xff
				salt[31] = lo & 0xff

				input.set(salt, 20)
				const hash = keccak_256(input)

				// Check 32-bit PoW: first 4 bytes must be zero
				if (hash[0] === 0 && hash[1] === 0 && hash[2] === 0 && hash[3] === 0) {
					running = false
					const masterIdHex = bytesToHex(hash.slice(4, 8))
					post({
						type: 'found',
						workerId,
						attempts: totalAttempts + i + 1,
						saltHex: bytesToHex(salt),
						masterIdHex,
						hashHex: bytesToHex(hash),
					})
					return
				}

				counter += stride
			}

			totalAttempts += batchSize
			const elapsed = performance.now() - startTime
			const hps = Math.round((totalAttempts / elapsed) * 1000)

			post({
				type: 'progress',
				workerId,
				attempts: totalAttempts,
				hashesPerSecond: hps,
			})

			// Yield to event loop for stop messages
			setTimeout(mine, 0)
		}

		post({ type: 'ready', workerId })
		mine()
	}
}
