import { create } from 'zustand'
import type { Address, Hex } from 'viem'
import { buildVirtualAddress, randomUserTag } from '#lib/virtual-address'
import type {
	DemoState,
	DemoStep,
	WalkthroughData,
} from '#lib/walkthrough-types'

// Pre-mined salt for anvil account 0 (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
const DEMO_SALT: Hex =
	'0x45864ef08bed66119277f37508c74bf955512a70eef5f96000000000bcb326b6'

let stepTimer: ReturnType<typeof setTimeout> | null = null

const initialData: WalkthroughData = {
	exchangeAddress: null,
	senderAddress: null,
	salt: null,
	masterId: null,
	miningProgress: null,
	virtualAddress: null,
	userTag: null,
	registerTxHash: null,
	transferTxHash: null,
	exchangeBalance: '0',
	senderBalance: '0',
	virtualBalance: '0',
	transferEvents: [],
}

type WalkthroughStore = {
	step: DemoStep
	demoState: DemoState
	speed: number
	txPending: boolean
	data: WalkthroughData
	startDemo: () => void
	setSpeed: (speed: number) => void
	reset: () => void
}

function clearTimer() {
	if (stepTimer !== null) {
		clearTimeout(stepTimer)
		stepTimer = null
	}
}

export const useWalkthroughStore = create<WalkthroughStore>((set, get) => {
	function scheduleNext(delay: number) {
		clearTimer()
		const { speed } = get()
		stepTimer = setTimeout(() => advanceStep(), delay / speed)
	}

	async function fetchBalances() {
		const { data } = get()
		const params = new URLSearchParams()
		if (data.virtualAddress) params.set('virtualAddress', data.virtualAddress)
		const res = await fetch(`/api/demo/balance?${params}`)
		const json = (await res.json()) as {
			exchange: string
			sender: string
			virtual: string
			exchangeAddress: Address | null
			senderAddress: Address | null
		}
		set((s) => ({
			data: {
				...s.data,
				exchangeBalance: json.exchange,
				senderBalance: json.sender,
				virtualBalance: json.virtual,
				exchangeAddress: json.exchangeAddress ?? s.data.exchangeAddress,
				senderAddress: json.senderAddress ?? s.data.senderAddress,
			},
		}))
	}

	async function advanceStep() {
		const { step } = get()

		switch (step) {
			case 'idle': {
				await fetchBalances()
				set({ step: 'register-start', demoState: 'registering' })
				scheduleNext(1500)
				break
			}

			case 'register-start': {
				set((s) => ({
					step: 'register-tx',
					txPending: true,
					data: { ...s.data, salt: DEMO_SALT },
				}))
				try {
					const res = await fetch('/api/demo/register', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ salt: DEMO_SALT }),
					})
					const json = (await res.json()) as {
						txHash: string
						blockNumber: number
						masterId: Hex
						exchangeAddress: Address
					}
					set((s) => ({
						step: 'register-confirmed',
						txPending: false,
						data: {
							...s.data,
							registerTxHash: json.txHash,
							masterId: json.masterId,
							exchangeAddress: json.exchangeAddress,
						},
					}))
					scheduleNext(1500)
				} catch {
					set({ txPending: false })
				}
				break
			}

			case 'register-mining':
			case 'register-tx':
				break

			case 'register-confirmed': {
				set({ step: 'derive-virtual', demoState: 'deriving' })
				scheduleNext(1200)
				break
			}

			case 'derive-virtual': {
				const { data: d } = get()
				if (d.masterId) {
					const userTag = randomUserTag()
					const virtualAddress = buildVirtualAddress(d.masterId, userTag)
					set((s) => ({
						data: { ...s.data, userTag, virtualAddress },
					}))
				}
				set({ step: 'derive-anatomy' })
				scheduleNext(2000)
				break
			}

			case 'derive-anatomy': {
				set({ step: 'send-start', demoState: 'sending' })
				scheduleNext(1200)
				break
			}

			case 'send-start': {
				const { data: d } = get()
				if (!d.virtualAddress) break
				set({ step: 'send-tx', txPending: true })
				try {
					const res = await fetch('/api/demo/transfer', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							virtualAddress: d.virtualAddress,
							amount: '100',
						}),
					})
					const json = (await res.json()) as {
						txHash: string
						blockNumber: number
						events: { from: string; to: string; amount: string }[]
					}
					const transferEvents = json.events.map((e, i) => ({
						...e,
						label: i === 0 ? 'sender → virtual' : 'virtual → exchange',
						txHash: json.txHash,
					}))
					set((s) => ({
						txPending: false,
						data: {
							...s.data,
							transferTxHash: json.txHash,
							transferEvents,
						},
					}))
					set({ step: 'resolve-detect', demoState: 'resolving' })
					scheduleNext(1200)
				} catch {
					set({ txPending: false })
				}
				break
			}

			case 'resolve-detect': {
				set({ step: 'resolve-lookup' })
				scheduleNext(1200)
				break
			}

			case 'resolve-lookup': {
				set({ step: 'resolve-forward' })
				scheduleNext(1200)
				break
			}

			case 'resolve-forward': {
				set({ step: 'transfer-events' })
				scheduleNext(1500)
				break
			}

			case 'transfer-events': {
				await fetchBalances()
				set({ step: 'balances-final' })
				scheduleNext(2000)
				break
			}

			case 'balances-final': {
				set({ step: 'complete', demoState: 'complete' })
				break
			}

			case 'complete':
				break
		}
	}

	return {
		step: 'idle',
		demoState: 'idle',
		speed: 1,
		txPending: false,
		data: { ...initialData },

		startDemo() {
			clearTimer()
			set({
				step: 'idle',
				demoState: 'idle',
				txPending: false,
				data: { ...initialData },
			})
			advanceStep()
		},

		setSpeed(speed: number) {
			set({ speed })
		},

		reset() {
			clearTimer()
			set({
				step: 'idle',
				demoState: 'idle',
				speed: 1,
				txPending: false,
				data: { ...initialData },
			})
		},
	}
})
