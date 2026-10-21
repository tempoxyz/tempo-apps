import { Link } from '@tanstack/react-router'
import { Button, Empty, Hex, style, Surface } from '@tempoxyz/ds'
import { Search } from '@tempoxyz/ds/icons'
import type { Hex as HexType } from 'ox'
import type * as React from 'react'
import { apostrophe } from '#lib/chars'
import { useMarkNotFoundPage } from '#lib/not-found'

export function NotFound(props: NotFound.Props): React.JSX.Element {
	const {
		title = 'Page not found',
		message = `The page you${apostrophe}re looking for doesn${apostrophe}t exist or has been moved.`,
		data,
	} = props
	useMarkNotFoundPage()

	return (
		<section {...styles.section()}>
			<Surface size="medium" {...styles.card()}>
				<Empty.Root>
					<Empty.Icon>
						<Search />
					</Empty.Icon>
					{/* The page's own heading, so not `Empty.Title`'s `h3`. */}
					<h1 {...styles.title()}>{title}</h1>
					<Empty.Description>{message}</Empty.Description>
					{data?.type === 'hash' && <Hex copy value={data.value} />}
					<Empty.Actions>
						<Button.Link render={<Link to="/" />}>Go home</Button.Link>
					</Empty.Actions>
				</Empty.Root>
			</Surface>
		</section>
	)
}

export declare namespace NotFound {
	type Props = {
		title?: string | undefined
		message?: string | undefined
		data?: NotFoundData | undefined
	}

	type NotFoundData = { type: 'hash'; value: HexType.Hex }
}

namespace styles {
	export const section = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		justifyContent: 'center',
		paddingBlock: '64',
		paddingInline: '16',
		width: '100% !custom',
	})

	export const card = style({
		maxWidth: '600px !custom',
		width: '100% !custom',
	})

	export const title = style({
		color: 'foreground',
		margin: '0',
		typography: 'heading.24',
	})
}
