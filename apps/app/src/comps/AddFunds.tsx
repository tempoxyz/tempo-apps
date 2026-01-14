import * as React from 'react'
import { cx } from '#lib/css'
import { useOnrampOrder, useShowApplePay } from '#lib/onramp'
import { ApplePayIframe } from '#comps/ApplePayIframe'
import LoaderIcon from '~icons/lucide/loader-2'

const PRESET_AMOUNTS = [25, 50, 100, 250]
const MIN_AMOUNT = 5
const MAX_AMOUNT = 10000

export function AddFunds(props: AddFunds.Props) {
	const { address } = props
	const showApplePay = useShowApplePay()
	const [amount, setAmount] = React.useState<number>(50)
	const [customAmount, setCustomAmount] = React.useState<string>('')
	const [isCustom, setIsCustom] = React.useState(false)

	const { createOrder, iframeUrl, reset, isLoading, lastOrderEvent } =
		useOnrampOrder({
			address,
			onSuccess: () => {
				console.log('Onramp success!')
			},
			onError: (error) => {
				console.error('Onramp error:', error)
			},
		})

	const effectiveAmount = isCustom ? Number(customAmount) || 0 : amount
	const isValidAmount =
		effectiveAmount >= MIN_AMOUNT && effectiveAmount <= MAX_AMOUNT

	const handlePresetClick = (value: number) => {
		setAmount(value)
		setIsCustom(false)
		setCustomAmount('')
	}

	const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.replace(/[^0-9.]/g, '')
		setCustomAmount(value)
		setIsCustom(true)
	}

	const handleSubmit = () => {
		if (!isValidAmount) return
		createOrder.mutate({ amount: effectiveAmount })
	}

	if (!showApplePay) {
		return (
			<div className="text-sm text-secondary">
				<p>Apple Pay is only available on Safari mobile.</p>
			</div>
		)
	}

	if (iframeUrl) {
		return (
			<div className="flex flex-col gap-2">
				<ApplePayIframe url={iframeUrl} onClose={reset} />
				{lastOrderEvent && (
					<div className="text-[11px] text-tertiary font-mono">
						Status: {lastOrderEvent.eventName.replace('onramp_api.', '')}
					</div>
				)}
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<p className="text-[12px] text-tertiary">
					Add funds to your account using Apple Pay. USDC will arrive on Base.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex gap-1.5">
					{PRESET_AMOUNTS.map((value) => (
						<button
							key={value}
							type="button"
							onClick={() => handlePresetClick(value)}
							className={cx(
								'flex-1 py-1.5 text-[13px] font-medium rounded-md cursor-pointer press-down transition-colors',
								!isCustom && amount === value
									? 'bg-accent text-white'
									: 'bg-base-alt text-secondary hover:text-primary',
							)}
						>
							${value}
						</button>
					))}
				</div>

				<div className="relative">
					<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-tertiary">
						$
					</span>
					<input
						type="text"
						inputMode="decimal"
						placeholder="Custom amount"
						value={customAmount}
						onChange={handleCustomChange}
						onFocus={() => setIsCustom(true)}
						className={cx(
							'w-full pl-5 pr-3 py-2 text-[13px] rounded-md border transition-colors',
							'bg-base placeholder:text-tertiary',
							isCustom
								? 'border-accent text-primary'
								: 'border-card-border text-secondary hover:border-accent/50',
						)}
					/>
				</div>

				{isCustom && customAmount && !isValidAmount && (
					<p className="text-[11px] text-negative">
						Amount must be between ${MIN_AMOUNT} and $
						{MAX_AMOUNT.toLocaleString()}
					</p>
				)}
			</div>

			<button
				type="button"
				onClick={handleSubmit}
				disabled={!isValidAmount || isLoading}
				className={cx(
					'flex items-center justify-center gap-2 w-full py-2.5 text-[13px] font-medium rounded-md cursor-pointer press-down transition-colors',
					isValidAmount && !isLoading
						? 'bg-[#000] text-white hover:bg-[#1a1a1a]'
						: 'bg-base-alt text-tertiary cursor-not-allowed',
				)}
			>
				{isLoading ? (
					<>
						<LoaderIcon className="size-2 animate-spin" />
						<span>Processing...</span>
					</>
				) : (
					<>
						<ApplePayMark />
						<span>Pay ${effectiveAmount || 0}</span>
					</>
				)}
			</button>

			{createOrder.error && (
				<p className="text-[11px] text-negative">{createOrder.error.message}</p>
			)}
		</div>
	)
}

function ApplePayMark() {
	const titleId = React.useId()
	return (
		<svg
			width="38"
			height="16"
			viewBox="0 0 38 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-labelledby={titleId}
		>
			<title id={titleId}>Apple Pay</title>
			<path
				d="M7.09 2.29c-.45.53-.81.97-.81 1.77.03.69.46 1.35.89 1.77.5.45.98.65 1.01.65.03 0 .06-.03.06-.03-.03-.1-.19-.35-.35-.62-.32-.53-.68-1.13-.68-1.83 0-.72.39-1.28.71-1.68.1-.13.19-.24.26-.35-.03 0-.06-.03-.1-.03-.29 0-.72.16-.99.35z"
				fill="currentColor"
			/>
			<path
				d="M9.28 6.39c-.55 0-1.07.32-1.36.32-.32 0-.81-.29-1.33-.29C5.36 6.42 4.2 7.52 4.2 9.52c0 1.29.5 2.64 1.13 3.52.52.74.97 1.36 1.65 1.36.65 0 .91-.42 1.68-.42.78 0 .97.42 1.68.42.68 0 1.13-.62 1.65-1.36.58-.87.84-1.71.84-1.74-.03 0-1.62-.65-1.62-2.45 0-1.55 1.23-2.26 1.29-2.29-.78-1.16-2-1.16-2.22-1.16z"
				fill="currentColor"
			/>
			<path
				d="M17.5 3.39h2.87c1.87 0 3.16 1.29 3.16 3.16 0 1.9-1.32 3.19-3.22 3.19h-1.87v3.29h-1.48V3.39h.55zm.94 5.16h1.55c1.32 0 2.06-.71 2.06-1.97 0-1.29-.74-2-2.06-2h-1.55v3.97z"
				fill="currentColor"
			/>
			<path
				d="M24.11 11.13c0-1.26.97-2.03 2.68-2.13l1.97-.1v-.55c0-.81-.55-1.29-1.45-1.29-.87 0-1.42.42-1.55 1.06h-1.35c.1-1.29 1.16-2.26 2.97-2.26 1.74 0 2.84.94 2.84 2.42v5.07h-1.36v-1.23h-.03c-.42.81-1.29 1.36-2.23 1.36-1.42-.06-2.5-.94-2.5-2.35zm4.65-.65v-.58l-1.77.1c-.9.06-1.42.48-1.42 1.1 0 .61.55 1.03 1.36 1.03.99 0 1.84-.68 1.84-1.65z"
				fill="currentColor"
			/>
			<path
				d="M32.11 15.42v-1.16c.1.03.32.03.42.03.61 0 .94-.26 1.16-.94l.13-.39-2.55-7h1.55l1.81 5.84h.03l1.81-5.84H38l-2.65 7.36c-.61 1.71-1.29 2.26-2.74 2.26-.1-.03-.39-.06-.5-.16z"
				fill="currentColor"
			/>
		</svg>
	)
}

export declare namespace AddFunds {
	type Props = {
		address: string
	}
}
