import { Link } from '@tanstack/react-router'

export function NotFound() {
	return (
		<section className="flex flex-1 size-full items-center justify-center relative">
			<div className="flex flex-col items-center gap-[8px] z-1 px-[16px]">
				<h1 className="text-[40px] lg:text-[60px] font-bold text-base-content">
					Page Not Found
				</h1>
				<p className="text-base-content-secondary text-[15px] lg:text-[18px] max-w-md text-center">
					The page you're looking for doesn't
					<br />
					exist or has been moved.
				</p>
				<Link to="/" className="text-accent rounded-[8px] press-down">
					Go back
				</Link>
			</div>
		</section>
	)
}
