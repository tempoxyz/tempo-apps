import { Link } from '@tanstack/react-router'
import { Button, Empty, style } from '@tempoxyz/ds'
import { Search } from '@tempoxyz/ds/icons'
import type { Hex } from 'ox'
import type * as React from 'react'
import { apostrophe } from '#lib/chars'
import { useMarkNotFoundPage } from '#lib/not-found'

export function NotFound({
	title = 'Page Not Found',
	message = `The page you${apostrophe}re looking for doesn${apostrophe}t exist or has been moved.`,
	data,
}: NotFound.Props): React.JSX.Element {
	useMarkNotFoundPage()

	return (
		<section {...styles.section()}>
			<div {...styles.card()}>
				{/* The page's own heading, so not `Empty.Title`'s `h3`. */}
				<Empty.Root {...styles.empty()}>
					<Empty.Icon>
						<Search />
					</Empty.Icon>
					<h1 {...styles.title()}>{title}</h1>
					<Empty.Description>{message}</Empty.Description>
					<Empty.Actions>
						<Button.Link render={<Link to="/" />}>Return home</Button.Link>
					</Empty.Actions>
				</Empty.Root>
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
		paddingBlock: '16',
		paddingInline: '4',
		width: '100% !custom',
	})

	// An unpadded bordered surface, so the hash row can run edge to edge.
	export const card = style({
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		maxWidth: '600px !custom',
		overflow: 'hidden',
		width: '100% !custom',
	})

	// TDS `Empty.Root` sets no height or main-axis alignment.
	export const empty = style({
		justifyContent: 'center',
		minHeight: '180px !custom',
		paddingBlock: '12',
	})

	export const title = style({
		color: 'foreground',
		margin: '0',
		marginBlockStart: '3',
		typography: 'heading.24.subtle',
	})

	export const hash = style({
		backgroundColor: 'grayAlpha.100',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		borderTopWidth: '1px',
		color: 'gray.900',
		margin: '0',
		padding: '4',
		textAlign: 'center',
		typography: 'label.12.mono',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-all',
	})
}
