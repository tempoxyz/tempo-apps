import { Link, useMatch } from '@tanstack/react-router'
import { Hex } from 'ox'
import { Footer } from './Footer.tsx'
import { Header } from './Header.tsx'

export function NotFound() {
	const txMatch = useMatch({
		from: '/_layout/tx/$hash',
		shouldThrow: false,
	})

	const hash = (txMatch?.params as { hash: string | undefined })?.hash
	const isValidHash = hash && Hex.validate(hash) && Hex.size(hash) === 32
	const isTx = txMatch?.status === 'notFound' && isValidHash

	const [title, message] = isTx
		? [
				'Transaction Not Found',
				"The transaction doesn't exist or hasn't been processed yet.",
			]
		: [
				'Page Not Found',
				"The page you're looking for doesn't exist or has been moved.",
			]

	return (
		<main className="flex min-h-dvh flex-col">
			<Header />
			<section className="flex flex-1 size-full items-center justify-center relative">
				<div className="flex flex-col items-center gap-[8px] z-1 px-[16px] w-full max-w-[600px]">
					<h1 className="text-[32px] lg:text-[40px] font-medium text-base-content">
						{title}
					</h1>
					<p className="text-base-content-secondary text-[15px] lg:text-[18px] text-center">
						{message}
					</p>
					{isTx && hash && (
						<pre className="text-[13px] text-base-content-secondary break-all bg-surface border border-base-border rounded-[10px] p-[12px] my-[16px] w-full whitespace-pre-wrap text-center">
							{hash}
						</pre>
					)}
					<div className="flex gap-[12px] items-center">
						<Link to="/" className="text-accent rounded-[8px] press-down">
							Go Home
						</Link>
					</div>
				</div>
			</section>
			<Footer />
		</main>
	)
}
