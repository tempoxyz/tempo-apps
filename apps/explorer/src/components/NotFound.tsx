import { Link } from '@tanstack/react-router'

export function NotFound() {
	return (
		<section className="flex flex-1 size-full items-center justify-center relative">
			<div className="flex flex-col items-center gap-[8px] z-1 px-[16px] w-full max-w-[600px]">
				<h1 className="text-[32px] lg:text-[40px] font-medium text-base-content">
					Page Not Found
				</h1>
				<p className="text-base-content-secondary text-[15px] lg:text-[18px] text-center">
					The page you’re looking for doesn’t exist or has been moved.
				</p>
				<div className="flex gap-[12px] items-center">
					<Link to="/" className="text-accent rounded-[8px] press-down">
						Go back
					</Link>
				</div>
			</div>
		</section>
	)
}
