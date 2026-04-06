import * as React from 'react'
import { cx } from '#lib/css'

export function StepIndicator(props: StepIndicator.Props): React.JSX.Element {
	const { steps, currentStep } = props

	return (
		<div className="flex items-center gap-2 mb-8">
			{steps.map((label, i) => {
				const step = i + 1
				const isActive = step === currentStep
				const isComplete = step < currentStep
				return (
					<React.Fragment key={label}>
						{i > 0 && (
							<div
								className={cx(
									'h-px flex-1 max-w-12',
									isComplete ? 'bg-accent' : 'bg-border',
								)}
							/>
						)}
						<div className="flex items-center gap-2">
							<div
								className={cx(
									'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
									isActive && 'bg-accent text-black',
									isComplete && 'bg-accent/20 text-accent',
									!isActive && !isComplete && 'bg-surface-2 text-text-tertiary',
								)}
							>
								{isComplete ? '✓' : step}
							</div>
							<span
								className={cx(
									'text-sm hidden sm:block',
									isActive && 'text-text-primary font-medium',
									!isActive && 'text-text-tertiary',
								)}
							>
								{label}
							</span>
						</div>
					</React.Fragment>
				)
			})}
		</div>
	)
}

export declare namespace StepIndicator {
	type Props = {
		steps: string[]
		currentStep: number
	}
}
