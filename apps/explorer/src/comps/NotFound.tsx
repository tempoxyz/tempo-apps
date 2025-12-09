import { Link, useMatch } from '@tanstack/react-router'
import { Hex } from 'ox'
import { apostrophe } from '#lib/chars'

export function NotFound() {
	const txMatch = useMatch({
		from: '/_layout/tx/$hash',
		shouldThrow: false,
	})
	const receiptMatch = useMatch({
		from: '/_layout/receipt/$hash',
		shouldThrow: false,
	})

	const txHash = (txMatch?.params as { hash: string | undefined })?.hash
	const receiptHash = (receiptMatch?.params as { hash: string | undefined })
		?.hash

	const isValidTxHash =
		txHash && Hex.validate(txHash) && Hex.size(txHash) === 32
	const isValidReceiptHash =
		receiptHash && Hex.validate(receiptHash) && Hex.size(receiptHash) === 32

	const isTxNotFound = txMatch?.status === 'notFound' && isValidTxHash
	const isReceiptNotFound =
		receiptMatch?.status === 'notFound' && isValidReceiptHash

	const hash = isTxNotFound ? txHash : isReceiptNotFound ? receiptHash : null

	const [title, message] = (() => {
		if (isTxNotFound)
			return [
				'Transaction Not Found',
				`The transaction doesn${apostrophe}t exist or hasn${apostrophe}t been processed yet.`,
			]
		if (isReceiptNotFound)
			return [
				'Receipt Not Found',
				`The receipt doesn${apostrophe}t exist or hasn${apostrophe}t been processed yet.`,
			]
		return [
			'Page Not Found',
			`The page you${apostrophe}re looking for doesn${apostrophe}t exist or has been moved.`,
		]
	})()

	return (
		<section className="flex flex-1 size-full items-center justify-center relative">
			<div className="flex flex-col items-center gap-[8px] z-1 px-[16px] w-full max-w-[600px]">
				<h1 className="text-[32px] lg:text-[40px] font-medium text-base-content">
					{title}
				</h1>
				<p className="text-base-content-secondary text-[15px] lg:text-[18px] text-center">
					{message}
				</p>
				{hash && (
					<pre className="text-[13px] text-base-content-secondary break-all bg-surface border border-base-border rounded-[10px] p-[12px] my-[16px] w-full whitespace-pre-wrap text-center">
						{hash}
					</pre>
				)}
				<div className="flex gap-[12px] items-center">
					<Link to="/" className="text-accent rounded-[8px] press-down">
						Go back
					</Link>
				</div>
			</div>
		</section>
	)
}
