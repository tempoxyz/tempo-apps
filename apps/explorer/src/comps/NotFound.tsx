import { Link } from '@tanstack/react-router'
import { vars as core } from '@tempoxyz/ds/core'
import { style, vars } from '@tempoxyz/ds/platform'
import { Search } from '@tempoxyz/ds/platform/icons'
import type { Hex } from 'ox'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Empty } from '#comps/ui/Empty'
import { apostrophe } from '#lib/chars'
import { useMarkNotFoundPage } from '#lib/not-found'
import { pressDown } from '#styles/explorer'

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
					icon={<Search />}
					title={<span {...styles.title()}>{title}</span>}
					action={
						<Link
							to="/"
							{...cx(vars({ set: 'inverse' }), styles.homeLink(), pressDown())}
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

	// TDS Button medium primary geometry on a link, in the inverse set. The
	// ring uses the page's primary content color because the inverse one
	// matches the page background.
	export const homeLink = style({
		alignItems: 'center',
		backgroundColor: 'background.primary',
		borderRadius: 'full',
		color: 'content.primary',
		columnGap: '4',
		display: 'inline-flex',
		height: '40',
		justifyContent: 'center',
		minWidth: '80px !custom',
		paddingInline: '24',
		textDecorationLine: 'none',
		typography: 'body.b2',
		whiteSpace: 'nowrap',
		':focus-visible': {
			outlineColor: `light-dark(${core.color.neutral['100']}, ${core.color.neutral['000']}) !custom`,
		},
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
