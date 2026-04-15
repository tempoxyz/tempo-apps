import { create } from 'zustand'
import type { Hex } from 'viem'
import type { FlowStep, WalkthroughData } from '#lib/walkthrough-types'
import { buildVirtualAddress, randomUserTag } from '#lib/virtual-address'
import {
	demoRegister,
	demoTransfer,
	demoBalance,
	demoFund,
} from '#lib/demo-client'

const DEMO_SALT: Hex =
	'0x45864ef08bed66119277f37508c74bf955512a70eef5f96000000000bcb326b6'

const TOTAL_STEPS = 7

const initialData: WalkthroughData = {
	exchangeAddress: null,
	senderAddress: null,
	salt: null,
	masterId: null,
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
	step: FlowStep
	prevStep: FlowStep
	isPlaying: boolean
	isBusy: boolean
	speed: number
	error: string | null
	phase: string | null
	data: WalkthroughData
	advance: () => Promise<void>
	goToStep: (target: FlowStep) => void
	togglePlay: () => void
	reset: () => void
}

export const useWalkthroughStore = create<WalkthroughStore>((set, get) => {
	let playingRef = false
	let cancelRef = false

	async function executeStep(targetStep: FlowStep): Promise<void> {
		set({ isBusy: true, error: null })
		try {
			switch (targetStep) {
				case 1: {
					set({ phase: 'Funding accounts…' })
					await demoFund().catch(() => {})
					set({ phase: 'Registering master…' })
					const reg = await demoRegister(DEMO_SALT)
					const balances = await demoBalance().catch(() => null)
					set((s) => ({
						data: {
							...s.data,
							salt: DEMO_SALT,
							masterId: reg.masterId as Hex,
							exchangeAddress: reg.exchangeAddress as `0x${string}`,
							registerTxHash: reg.txHash,
							...(balances
								? {
										exchangeBalance: balances.exchange,
										senderBalance: balances.sender,
										senderAddress:
											(balances.senderAddress as `0x${string}` | null) ?? null,
									}
								: {}),
						},
					}))
					break
				}
				case 2: {
					set({ phase: 'Deriving address…' })
					const { data: d } = get()
					if (d.masterId) {
						const userTag = randomUserTag()
						const virtualAddress = buildVirtualAddress(d.masterId, userTag)
						set((s) => ({
							data: { ...s.data, userTag, virtualAddress },
						}))
					}
					break
				}
				case 3: {
					set({ phase: 'Sending PathUSD…' })
					const { data: d } = get()
					if (!d.virtualAddress) break
					const tx = await demoTransfer(d.virtualAddress, '100')
					const events = tx.events.map((e, i) => ({
						...e,
						label: i === 0 ? 'sender → virtual' : 'virtual → master',
						txHash: tx.txHash,
					}))
					set((s) => ({
						data: {
							...s.data,
							transferTxHash: tx.txHash,
							transferEvents: events,
						},
					}))
					break
				}
				case 4: {
					set({ phase: 'Resolving virtual address…' })
					await new Promise((r) => setTimeout(r, 800))
					break
				}
				case 5: {
					set({ phase: 'Updating balances…' })
					const { data: d } = get()
					const balances = await demoBalance(d.virtualAddress ?? undefined)
					set((s) => ({
						data: {
							...s.data,
							exchangeBalance: balances.exchange,
							senderBalance: balances.sender,
							virtualBalance: balances.virtual,
						},
					}))
					break
				}
				default:
					break
			}
		} catch (e) {
			set({ error: e instanceof Error ? e.message : 'Step failed' })
		} finally {
			set({ isBusy: false, phase: null })
		}
	}

	async function runAutoplay() {
		const { step: startStep } = get()
		let current = startStep === 0 || startStep >= 6 ? 0 : startStep

		if (current === 0) {
			set({
				prevStep: 0 as FlowStep,
				step: 1 as FlowStep,
			})
			current = 1
			await executeStep(1 as FlowStep)
			await new Promise((r) => setTimeout(r, 1200))
		}

		while (!cancelRef && playingRef && current < TOTAL_STEPS - 1) {
			const next = (current + 1) as FlowStep
			set({ prevStep: current as FlowStep, step: next })
			if (next >= 1 && next <= 5) await executeStep(next)
			current = next
			if (current < TOTAL_STEPS - 1) {
				await new Promise((r) => setTimeout(r, 1200))
			}
		}

		if (!cancelRef) {
			set({ isPlaying: false })
			playingRef = false
		}
	}

	return {
		step: 0 as FlowStep,
		prevStep: 0 as FlowStep,
		isPlaying: false,
		isBusy: false,
		speed: 1,
		error: null,
		phase: null,
		data: { ...initialData },

		async advance() {
			const { step, isBusy } = get()
			if (isBusy || step >= 6) return
			const next = Math.min(step + 1, 6) as FlowStep
			set({ prevStep: step, step: next })
			if (next >= 1 && next <= 5) {
				await executeStep(next)
			}
		},

		goToStep(target: FlowStep) {
			const { isBusy, step } = get()
			if (isBusy) return
			set({
				prevStep: step,
				step: target,
				isPlaying: false,
			})
			playingRef = false
			for (let s = 1; s <= Math.min(target, 5); s++) {
				executeStep(s as FlowStep)
			}
		},

		togglePlay() {
			const { isPlaying } = get()
			if (isPlaying) {
				set({ isPlaying: false })
				playingRef = false
			} else {
				cancelRef = false
				playingRef = true
				set({ isPlaying: true })
				runAutoplay()
			}
		},

		reset() {
			playingRef = false
			cancelRef = true
			set({
				step: 0 as FlowStep,
				prevStep: 0 as FlowStep,
				isPlaying: false,
				isBusy: false,
				speed: 1,
				error: null,
				phase: null,
				data: { ...initialData },
			})
		},
	}
})
