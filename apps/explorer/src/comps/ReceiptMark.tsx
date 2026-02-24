export function ReceiptMark() {
	return (
		<>
			<img
				src="/signet-receipt-light.svg"
				alt="Signet Receipt"
				width={104}
				height={54}
				className="block dark:hidden"
			/>
			<img
				src="/signet-receipt-dark.svg"
				alt="Signet Receipt"
				width={104}
				height={54}
				className="hidden dark:block"
			/>
		</>
	)
}
