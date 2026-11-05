import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ListGroup, style } from '@tempoxyz/ds'

const demoPages = [
	{ path: '/demo/tx', label: 'Transaction' },
	{ path: '/demo/address', label: 'Address' },
	{ path: '/demo/pagination', label: 'Pagination' },
	{ path: '/demo/empty-state', label: 'Empty state' },
]

function loader() {
	if (import.meta.env.VITE_ENABLE_DEMO !== 'true') throw notFound()
	return {}
}

export const Route = createFileRoute('/_layout/demo/')({
	component: Component,
	loader,
})

function Component() {
	return (
		<div {...styles.page()}>
			<h1 {...styles.title()}>Demos</h1>
			<ListGroup.Root>
				{demoPages.map((page) => (
					<ListGroup.Row
						key={page.path}
						action="navigation"
						render={<Link to={page.path} />}
					>
						{page.label}
					</ListGroup.Row>
				))}
			</ListGroup.Root>
		</div>
	)
}

namespace styles {
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		marginInline: 'auto !custom',
		maxWidth: '384',
		paddingBottom: '32',
		paddingInline: '16',
		paddingTop: '64',
		width: '100% !custom',
	})

	export const title = style({
		color: 'content.primary',
		margin: '0',
		typography: 'heading.h2',
	})
}
