import { Link } from '@tanstack/react-router'
import type { Hex } from 'ox'
import { apostrophe } from '#lib/chars'

export function NotFound({
	title = 'Page Not Found',
	message = `The page you${apostrophe}re looking for doesn${apostrophe}t exist or has been moved.`,
	data,
}: NotFound.Props) {
	return (
		<section className="flex flex-1 size-full items-center justify-center relative pt-[80px]">
			<div className="flex flex-col items-center gap-[8px] z-1 px-[16px] w-full max-w-[600px]">
				<h1 className="text-[32px] lg:text-[40px] font-medium text-base-content">
					{title}
				</h1>
				<p className="text-base-content-secondary text-[15px] lg:text-[18px] text-center">
					{message}
				</p>
				{data?.type === 'hash' && (
					<pre className="text-[13px] text-base-content-secondary break-all bg-surface border border-base-border rounded-[10px] p-[12px] my-[16px] w-full whitespace-pre-wrap text-center">
						{data.value}
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

export namespace NotFound {
	export interface Props {
		title?: string
		message?: string
		data?: NotFoundData
	}

	export type NotFoundData = { type: 'hash'; value: Hex.Hex }
}
