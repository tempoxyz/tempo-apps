import { type ErrorComponentProps, Link } from '@tanstack/react-router'
import { useCopy } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'
import { Footer } from './Footer'
import { Header } from './Header'

export function ErrorBoundary({ error }: ErrorComponentProps) {
	const copy = useCopy()
	console.error(error)
	return (
		<main className="flex min-h-dvh flex-col">
			<Header />
			<section className="flex flex-1 flex-col size-full items-center justify-center px-[16px] max-w-[600px] gap-[16px] m-auto">
				<div className="flex flex-col items-center gap-[8px]">
					<h1 className="text-[24px] lg:text-[40px] font-medium text-base-content">
						Something Went Wrong
					</h1>
					<p className="text-base-content-secondary text-[15px] lg:text-[18px] text-center">
						An unexpected error occurred while loading this page.
					</p>
				</div>
				{error?.message && (
					<div className="bg-surface border border-base-border rounded-[10px] p-[16px] max-w-full overflow-hidden relative">
						<pre className="text-[13px] text-base-content-secondary whitespace-pre-wrap pr-[32px] leading-[20px] min-h-[40px]">
							{error.message}
						</pre>
						{copy.notifying && (
							<span className="absolute bottom-[12px] right-[40px] text-[13px] leading-[16px] text-base-content-secondary whitespace-nowrap">
								copied
							</span>
						)}
						<button
							type="button"
							onClick={() => copy.copy(error.message)}
							className="absolute bottom-[8px] right-[8px] p-[4px] text-base-content-secondary press-down cursor-pointer"
						>
							<CopyIcon className="size-[16px]" />
						</button>
					</div>
				)}
				<Link to="/" className="text-accent rounded-[8px] press-down">
					Go Back
				</Link>
			</section>
			<Footer />
		</main>
	)
}
