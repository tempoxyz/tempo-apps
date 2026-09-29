import { Button, Empty } from 'regen-ui'
import SearchXIcon from '~icons/lucide/search-x'
import { Link } from '@tanstack/react-router'
import type { Hex } from 'ox'
import { apostrophe } from '#lib/chars'
import { useMarkNotFoundPage } from '#lib/not-found'

export function NotFound({
	title = 'Page Not Found',
	message = `The page you${apostrophe}re looking for doesn${apostrophe}t exist or has been moved.`,
	data,
}: NotFound.Props): React.JSX.Element {
	useMarkNotFoundPage()

	return (
		<section className="flex flex-1 size-full items-center justify-center px-4 py-16">
			<div className="w-full max-w-[600px] rounded-body border border-base-border bg-surface">
				<Empty
					icon={<SearchXIcon />}
					title={<span className="heading-24">{title}</span>}
					action={
						<Button render={<Link to="/" />} variant="primary">
							Return home
						</Button>
					}
				>
					{message}
				</Empty>
				{data?.type === 'hash' && (
					<pre className="border-t border-base-border bg-pane p-4 copy-13 text-secondary break-all whitespace-pre-wrap text-center">
						{data.value}
					</pre>
				)}
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
