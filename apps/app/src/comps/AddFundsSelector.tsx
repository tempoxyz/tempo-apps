import * as React from 'react'
import { cx } from '#lib/css'
import { AddFunds } from '#comps/AddFunds'
import { AddFundsStripe } from '#comps/AddFundsStripe'
import { useShowApplePay } from '#lib/onramp'
import AppleIcon from '~icons/mdi/apple'
import CreditCardIcon from '~icons/lucide/credit-card'

type PaymentMethod = 'apple_pay' | 'card'

export function AddFundsSelector(props: AddFundsSelector.Props) {
	const { address } = props
	const showApplePay = useShowApplePay()
	const [selectedMethod, setSelectedMethod] = React.useState<PaymentMethod>(
		showApplePay ? 'apple_pay' : 'card',
	)

	React.useEffect(() => {
		if (!showApplePay && selectedMethod === 'apple_pay') {
			setSelectedMethod('card')
		}
	}, [showApplePay, selectedMethod])

	return (
		<div className="flex flex-col gap-3">
			<div className="flex gap-1.5">
				{showApplePay && (
					<button
						type="button"
						onClick={() => setSelectedMethod('apple_pay')}
						className={cx(
							'flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium rounded-md cursor-pointer press-down transition-colors border',
							selectedMethod === 'apple_pay'
								? 'bg-black-white text-white-black border-black-white'
								: 'bg-base-alt text-secondary border-transparent hover:text-primary',
						)}
					>
						<AppleIcon className="size-4" />
						<span>Apple Pay</span>
					</button>
				)}
				<button
					type="button"
					onClick={() => setSelectedMethod('card')}
					className={cx(
						'flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium rounded-md cursor-pointer press-down transition-colors border',
						selectedMethod === 'card'
							? 'bg-accent text-white border-accent'
							: 'bg-base-alt text-secondary border-transparent hover:text-primary',
					)}
				>
					<CreditCardIcon className="size-4" />
					<span>Card</span>
				</button>
			</div>

			{selectedMethod === 'apple_pay' ? (
				<AddFunds address={address} />
			) : (
				<AddFundsStripe address={address} />
			)}
		</div>
	)
}

export declare namespace AddFundsSelector {
	type Props = {
		address: string
	}
}
