import * as React from 'react'
import {
	Elements,
	PaymentElement,
	useStripe,
	useElements,
} from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { cx } from '#lib/css'
import { useStripeOnramp, useStripeInstance } from '#lib/stripe-onramp'
import LoaderIcon from '~icons/lucide/loader-2'
import CheckIcon from '~icons/lucide/check'

const PRESET_AMOUNTS = [25, 50, 100, 250]
const MIN_AMOUNT = 5
const MAX_AMOUNT = 10000

const stripeAppearance: StripeElementsOptions['appearance'] = {
	theme: 'flat',
	variables: {
		fontFamily: 'Pilat, system-ui, sans-serif',
		fontSizeBase: '14px',
		spacingUnit: '4px',
		borderRadius: '8px',
		colorPrimary: '#3b82f6',
		colorBackground: '#1a1a1a',
		colorText: '#f5f5f5',
		colorTextSecondary: '#a0a0a0',
		colorTextPlaceholder: '#6e6e6e',
		colorDanger: '#ef4444',
	},
	rules: {
		'.Input': {
			backgroundColor: '#222222',
			border: '1px solid #2a2a2a',
			color: '#f5f5f5',
			padding: '12px',
		},
		'.Input:focus': {
			borderColor: '#3b82f6',
			boxShadow: '0 0 0 1px #3b82f6',
		},
		'.Input--invalid': {
			borderColor: '#ef4444',
		},
		'.Label': {
			color: '#a0a0a0',
			fontSize: '12px',
			fontWeight: '500',
			marginBottom: '6px',
		},
		'.Error': {
			color: '#ef4444',
			fontSize: '12px',
		},
		'.Tab': {
			backgroundColor: '#222222',
			border: '1px solid #2a2a2a',
			color: '#a0a0a0',
		},
		'.Tab--selected': {
			backgroundColor: '#2a2a2a',
			borderColor: '#3b82f6',
			color: '#f5f5f5',
		},
		'.Tab:hover': {
			borderColor: '#3b82f6',
		},
	},
}

type InlinePaymentFormProps = {
	amount: number
	onSuccess: () => void
	onError: (error: Error) => void
	onCancel: () => void
}

function InlinePaymentForm(props: InlinePaymentFormProps) {
	const { amount, onSuccess, onError, onCancel } = props
	const stripe = useStripe()
	const elements = useElements()
	const [isProcessing, setIsProcessing] = React.useState(false)
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (!stripe || !elements) {
			return
		}

		setIsProcessing(true)
		setErrorMessage(null)

		const { error } = await stripe.confirmPayment({
			elements,
			confirmParams: {
				return_url: window.location.href,
			},
			redirect: 'if_required',
		})

		if (error) {
			setErrorMessage(error.message ?? 'Payment failed')
			setIsProcessing(false)
			onError(new Error(error.message ?? 'Payment failed'))
		} else {
			onSuccess()
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<PaymentElement
				options={{
					layout: 'tabs',
					paymentMethodOrder: ['card', 'apple_pay'],
					wallets: {
						applePay: 'auto',
						googlePay: 'never',
					},
				}}
			/>

			{errorMessage && (
				<p className="text-[12px] text-negative">{errorMessage}</p>
			)}

			<div className="flex gap-2">
				<button
					type="button"
					onClick={onCancel}
					disabled={isProcessing}
					className={cx(
						'flex-1 py-2.5 text-[13px] font-medium rounded-md cursor-pointer transition-colors',
						'bg-base-alt text-secondary hover:text-primary',
						isProcessing && 'opacity-50 cursor-not-allowed',
					)}
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!stripe || isProcessing}
					className={cx(
						'flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-medium rounded-md cursor-pointer transition-colors',
						stripe && !isProcessing
							? 'bg-accent text-white hover:bg-accent-hover'
							: 'bg-base-alt text-tertiary cursor-not-allowed',
					)}
				>
					{isProcessing ? (
						<>
							<LoaderIcon className="size-3 animate-spin" />
							<span>Processing...</span>
						</>
					) : (
						<span>Pay ${amount.toFixed(2)}</span>
					)}
				</button>
			</div>
		</form>
	)
}

export function AddFundsStripe(props: AddFundsStripe.Props) {
	const { address } = props
	const stripePromise = useStripeInstance()
	const [amount, setAmount] = React.useState<number>(50)
	const [customAmount, setCustomAmount] = React.useState<string>('')
	const [isCustom, setIsCustom] = React.useState(false)

	const {
		createPaymentIntent,
		clientSecret,
		paymentStatus,
		reset,
		handlePaymentSuccess,
		handlePaymentError,
		isLoading,
	} = useStripeOnramp({
		address,
		onSuccess: () => {
			console.log('Stripe onramp success!')
		},
		onError: (error) => {
			console.error('Stripe onramp error:', error)
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
		if (!isValidAmount || !stripePromise) return
		createPaymentIntent.mutate({ amount: effectiveAmount })
	}

	const showPaymentForm = !!clientSecret && paymentStatus !== 'succeeded'

	if (paymentStatus === 'succeeded') {
		return (
			<div className="flex flex-col items-center gap-3 py-6">
				<div className="flex items-center justify-center size-12 rounded-full bg-positive/10">
					<CheckIcon className="size-6 text-positive" />
				</div>
				<div className="text-center">
					<p className="text-sm font-medium text-primary">Payment Successful</p>
					<p className="text-[12px] text-secondary mt-1">
						Your funds will arrive shortly.
					</p>
				</div>
				<button
					type="button"
					onClick={reset}
					className="mt-2 px-4 py-2 text-[13px] font-medium text-accent hover:text-accent-hover transition-colors"
				>
					Add More Funds
				</button>
			</div>
		)
	}

	if (showPaymentForm && stripePromise) {
		const options: StripeElementsOptions = {
			clientSecret,
			appearance: stripeAppearance,
		}

		return (
			<div className="py-2.5">
				<Elements stripe={stripePromise} options={options}>
					<InlinePaymentForm
						amount={effectiveAmount}
						onSuccess={handlePaymentSuccess}
						onError={handlePaymentError}
						onCancel={reset}
					/>
				</Elements>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-3 py-2.5">
			<div className="flex flex-col gap-1">
				<p className="text-[12px] text-tertiary">
					Add funds to your account using a card. USDC will arrive on Base.
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
						onFocus={handleInputFocus}
						onBlur={handleInputBlur}
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
				disabled={!isValidAmount || isLoading || !stripePromise}
				className={cx(
					'flex items-center justify-center gap-2 w-full py-2.5 text-[13px] font-medium rounded-md cursor-pointer press-down transition-colors',
					isValidAmount && !isLoading && stripePromise
						? 'bg-accent text-white hover:bg-accent-hover'
						: 'bg-base-alt text-tertiary cursor-not-allowed',
				)}
			>
				{isLoading ? (
					<>
						<LoaderIcon className="size-3 animate-spin" />
						<span>Processing...</span>
					</>
				) : (
					<span>Fund ${effectiveAmount || 0}</span>
				)}
			</button>

			{createPaymentIntent.error && (
				<p className="text-[11px] text-negative">
					{createPaymentIntent.error.message}
				</p>
			)}
		</div>
	)
}

export declare namespace AddFundsStripe {
	type Props = {
		address: string
	}
}
