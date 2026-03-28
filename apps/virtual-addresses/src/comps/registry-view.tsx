import * as React from 'react'
import { useState, useCallback } from 'react'
import type { Address } from 'viem'
import { StepIndicator } from '#comps/step-indicator'
import { StepMine } from '#comps/step-mine'
import { StepRegister } from '#comps/step-register'
import { StepGenerate } from '#comps/step-generate'
import { StepTransfer } from '#comps/step-transfer'
import { useMiner } from '#lib/use-miner'

const STEPS = ['Mine Salt', 'Register', 'Generate', 'Transfer']

export function RegistryView(): React.JSX.Element {
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
		<main className="max-w-2xl mx-auto px-6 py-8">
			<div className="mb-8">
				<h1 className="text-2xl font-bold tracking-tight mb-2">
					Virtual Address Registry
				</h1>
				<p className="text-text-secondary text-sm leading-relaxed">
					Register your address as a virtual-address master. Mine a valid salt,
					register on-chain, then derive unlimited deposit addresses offline.
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

				{currentStep >= 2 && minedSalt && minedMasterId && minedForAddress && (
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

			<footer className="mt-12 pt-6 border-t border-border text-center">
				<div className="flex items-center justify-center gap-3 text-xs">
					<a
						href="https://tempo.xyz"
						target="_blank"
						rel="noopener noreferrer"
						className="text-text-tertiary hover:text-accent transition-colors"
					>
						Tempo
					</a>
					<span className="text-text-tertiary">·</span>
					<a
						href="https://github.com/tempoxyz/tempo/pull/3286"
						target="_blank"
						rel="noopener noreferrer"
						className="text-text-tertiary hover:text-accent transition-colors"
					>
						TIP-1022 Spec
					</a>
					<span className="text-text-tertiary">·</span>
					<a
						href="https://docs.tempo.xyz"
						target="_blank"
						rel="noopener noreferrer"
						className="text-text-tertiary hover:text-accent transition-colors"
					>
						Docs
					</a>
				</div>
			</footer>
		</main>
	)
}
