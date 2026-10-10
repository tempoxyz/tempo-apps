import SearchXIcon from '~icons/lucide/search-x'
import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Hex } from 'ox'
import { cx } from 'zyzz'
import { Empty } from '#comps/ui/Empty'
import { apostrophe } from '#lib/chars'
import { useMarkNotFoundPage } from '#lib/not-found'
import { pressDown, transitionColors } from '#styles/explorer'

export function NotFound({
	title = 'Page Not Found',
	message = `The page you${apostrophe}re looking for doesn${apostrophe}t exist or has been moved.`,
	data,
}: NotFound.Props): React.JSX.Element {
	useMarkNotFoundPage()

	return (
		<section {...styles.section()}>
			<div {...styles.card()}>
				<Empty
					icon={<SearchXIcon />}
					title={<span {...styles.title()}>{title}</span>}
					action={
						<Link
							to="/"
							{...cx(styles.homeLink(), transitionColors(), pressDown())}
						>
							Return home
						</Link>
					}
				>
					{message}
				</Empty>
				{data?.type === 'hash' && <pre {...styles.hash()}>{data.value}</pre>}
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

namespace styles {
	export const section = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		height: '100% !custom',
		justifyContent: 'center',
		paddingBlock: '64',
		paddingInline: '16',
		width: '100% !custom',
	})

	export const card = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		maxWidth: '600px !custom',
		overflow: 'hidden',
		width: '100% !custom',
	})

	export const title = style({ typography: 'heading.h2' })

	// A link in the TDS medium primary Button style.
	export const homeLink = style({
		alignItems: 'center',
		backgroundColor: 'component.button.primary.fill',
		borderRadius: 'full',
		boxSizing: 'border-box',
		color: 'background.secondary',
		display: 'inline-flex',
		height: '40',
		justifyContent: 'center',
		minWidth: '80px !custom',
		paddingInline: '24',
		textDecorationLine: 'none',
		typography: 'body.b2',
		whiteSpace: 'nowrap',
	})

	export const hash = style({
		backgroundColor: 'container.subtle',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderTopWidth: 'regular',
		color: 'content.secondary',
		margin: 'none',
		padding: '16',
		textAlign: 'center',
		typography: 'mono.inline',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-all',
	})
}
