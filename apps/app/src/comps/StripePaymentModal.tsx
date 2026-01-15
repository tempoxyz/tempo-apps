import * as React from 'react'
import {
	Elements,
	PaymentElement,
	useStripe,
	useElements,
} from '@stripe/react-stripe-js'
import type { Stripe, StripeElementsOptions } from '@stripe/stripe-js'
import { cx } from '#lib/css'
import LoaderIcon from '~icons/lucide/loader-2'
import XIcon from '~icons/lucide/x'

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

type PaymentFormProps = {
	amount: number
	onSuccess: () => void
	onError: (error: Error) => void
	onCancel: () => void
}

function PaymentForm(props: PaymentFormProps) {
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

			<div className="flex gap-2 mt-2">
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

export type StripePaymentModalProps = {
	stripePromise: Promise<Stripe | null>
	clientSecret: string
	amount: number
	onSuccess: () => void
	onError: (error: Error) => void
	onCancel: () => void
}

export function StripePaymentModal(props: StripePaymentModalProps) {
	const { stripePromise, clientSecret, amount, onSuccess, onError, onCancel } =
		props

	const options: StripeElementsOptions = {
		clientSecret,
		appearance: stripeAppearance,
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="relative w-full max-w-md mx-4 p-6 bg-card rounded-xl border border-card-border shadow-xl max-h-[90vh] overflow-y-auto">
				<button
					type="button"
					onClick={onCancel}
					className="absolute top-4 right-4 p-1 text-secondary hover:text-primary transition-colors"
					aria-label="Close"
				>
					<XIcon className="size-5" />
				</button>

				<h2 className="text-lg font-medium text-primary mb-4">
					Complete Payment
				</h2>

				<Elements stripe={stripePromise} options={options}>
					<PaymentForm
						amount={amount}
						onSuccess={onSuccess}
						onError={onError}
						onCancel={onCancel}
					/>
				</Elements>
			</div>
		</div>
	)
}

export declare namespace StripePaymentModal {
	type Props = StripePaymentModalProps
}
