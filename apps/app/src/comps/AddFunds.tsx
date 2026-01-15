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

	const { createOrder, iframeUrl, isLoading, reset } = useOnrampOrder({
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

	const [isInputFocused, setIsInputFocused] = React.useState(false)

	const handlePresetClick = (value: number) => {
		setAmount(value)
		setCustomAmount(String(value))
		setIsCustom(!isInputFocused)
	}

	const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.replace(/[^0-9.]/g, '')
		setCustomAmount(value)
		setIsCustom(true)
	}

	const handleInputFocus = () => {
		setIsInputFocused(true)
		setIsCustom(true)
	}

	const handleInputBlur = () => {
		setIsInputFocused(false)
	}

	const handleSubmit = () => {
		if (!isValidAmount) return
		createOrder.mutate({ amount: effectiveAmount })
	}

	const [isIframeLoaded, setIsIframeLoaded] = React.useState(false)
	const isModalOpen = !!iframeUrl

	React.useEffect(() => {
		if (!iframeUrl) {
			setIsIframeLoaded(false)
		}
	}, [iframeUrl])

	if (!showApplePay) {
		return (
			<div className="text-sm text-secondary">
				<p>Apple Pay is only available on Safari mobile.</p>
			</div>
		)
	}

	return (
		<>
			<div className="flex flex-col gap-3 py-2.5">
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
								disabled={isModalOpen}
								className={cx(
									'flex-1 py-1.5 text-[13px] font-medium rounded-md cursor-pointer press-down transition-colors',
									!isCustom && amount === value
										? 'bg-accent text-white'
										: 'bg-base-alt text-secondary hover:text-primary',
									isModalOpen && 'opacity-50 cursor-not-allowed',
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
							onFocus={handleInputFocus}
							onBlur={handleInputBlur}
							disabled={isModalOpen}
							className={cx(
								'w-full pl-5 pr-3 py-2 text-[13px] rounded-md border transition-colors',
								'bg-base placeholder:text-tertiary',
								isCustom
									? 'border-accent text-primary'
									: 'border-card-border text-secondary hover:border-accent/50',
								isModalOpen && 'opacity-50 cursor-not-allowed',
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
					disabled={!isValidAmount || isLoading || isModalOpen}
					className={cx(
						'flex items-center justify-center gap-2 w-full py-2.5 text-[13px] font-medium rounded-md cursor-pointer press-down transition-colors',
						isValidAmount && !isLoading && !isModalOpen
							? 'bg-[#000] text-white hover:bg-[#1a1a1a]'
							: 'bg-base-alt text-tertiary cursor-not-allowed',
					)}
				>
					{isLoading || (isModalOpen && !isIframeLoaded) ? (
						<>
							<LoaderIcon className="size-3 animate-spin" />
							<span>Processing...</span>
						</>
					) : (
						<span>Pay ${effectiveAmount || 0}</span>
					)}
				</button>

				{createOrder.error && (
					<p className="text-[11px] text-negative">{createOrder.error.message}</p>
				)}
			</div>

			{isModalOpen && (
				<ApplePayIframe
					url={iframeUrl}
					onLoad={() => setIsIframeLoaded(true)}
					onCancel={reset}
				/>
			)}
		</>
	)
}

export declare namespace AddFunds {
	type Props = {
		address: string
	}
}
