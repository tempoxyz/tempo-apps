import * as React from 'react'
import { useState, useCallback } from 'react'
import type { Address } from 'viem'
import { Header } from '#comps/header'
import { StepIndicator } from '#comps/step-indicator'
import { StepMine } from '#comps/step-mine'
import { StepRegister } from '#comps/step-register'
import { StepGenerate } from '#comps/step-generate'
import { StepTransfer } from '#comps/step-transfer'
import { useMiner } from '#lib/use-miner'

const STEPS = ['Mine Salt', 'Register', 'Generate', 'Transfer']

export function App(): React.JSX.Element {
	const miner = useMiner()

	const [currentStep, setCurrentStep] = useState(1)
	const [registrationTx, setRegistrationTx] = useState<string | null>(null)
	const [selectedVirtualAddress, setSelectedVirtualAddress] =
		useState<Address | null>(null)

	const handleStartMining = useCallback(
		(addr: string) => {
			miner.start(addr)
		},
		[miner.start],
	)

	const handleRegistered = useCallback((txHash: string) => {
		setRegistrationTx(txHash)
		setCurrentStep(3)
	}, [])

	const handleSelectAddress = useCallback((addr: Address) => {
		setSelectedVirtualAddress(addr)
		setCurrentStep(4)
	}, [])

	// Auto-advance to step 2 when salt is found
	React.useEffect(() => {
		if (miner.state.status === 'found' && currentStep === 1) {
			setCurrentStep(2)
		}
	}, [miner.state.status, currentStep])

	const minedSalt = miner.state.status === 'found' ? miner.state.salt : null
	const minedMasterId =
		miner.state.status === 'found' ? miner.state.masterId : null
	const minedForAddress =
		miner.state.status === 'found' ? miner.state.minedForAddress : null

	return (
		<div className="min-h-screen bg-bg">
			<Header />

			<main className="max-w-2xl mx-auto px-6 py-8">
				<div className="mb-8">
					<h1 className="text-2xl font-bold tracking-tight mb-2">
						TIP-1022 Virtual Addresses
					</h1>
					<p className="text-text-secondary text-sm leading-relaxed">
						Virtual addresses auto-forward TIP-20 deposits to a registered
						master wallet. No sweep transactions, no per-address state, no gas
						overhead. Register once, derive unlimited deposit addresses offline.
					</p>
				</div>

				<StepIndicator steps={STEPS} currentStep={currentStep} />

				<div className="space-y-6">
					{currentStep >= 1 && (
						<StepMine
							minerState={miner.state}
							onStart={handleStartMining}
							onStop={miner.stop}
						/>
					)}

					{currentStep >= 2 &&
						minedSalt &&
						minedMasterId &&
						minedForAddress && (
							<StepRegister
								salt={minedSalt}
								masterId={minedMasterId}
								minedForAddress={minedForAddress}
								onRegistered={handleRegistered}
							/>
						)}

					{currentStep >= 3 &&
						minedMasterId &&
						minedForAddress &&
						registrationTx && (
							<StepGenerate
								masterId={minedMasterId}
								masterAddress={minedForAddress}
								onSelectAddress={handleSelectAddress}
							/>
						)}

					{currentStep >= 4 && selectedVirtualAddress && minedForAddress && (
						<StepTransfer
							virtualAddress={selectedVirtualAddress}
							masterAddress={minedForAddress}
						/>
					)}
				</div>

				<footer className="mt-12 pt-6 border-t border-border text-center space-y-2">
					<div className="text-text-tertiary text-xs">
						Built on{' '}
						<a
							href="https://tempo.xyz"
							target="_blank"
							rel="noopener noreferrer"
							className="text-accent hover:text-accent-hover"
						>
							Tempo
						</a>{' '}
						·{' '}
						<a
							href="https://github.com/tempoxyz/tempo/pull/3286"
							target="_blank"
							rel="noopener noreferrer"
							className="text-accent hover:text-accent-hover"
						>
							TIP-1022 Spec
						</a>{' '}
						·{' '}
						<a
							href="https://docs.tempo.xyz"
							target="_blank"
							rel="noopener noreferrer"
							className="text-accent hover:text-accent-hover"
						>
							Docs
						</a>
					</div>
					<div className="text-text-tertiary text-xs">
						Running on Moderato testnet
					</div>
				</footer>
			</main>
		</div>
	)
}
