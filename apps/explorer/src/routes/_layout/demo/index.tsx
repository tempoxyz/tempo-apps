import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'

const demoPages = [
	{ path: '/demo/tx', label: 'Transaction' },
	{ path: '/demo/address', label: 'Address' },
	{ path: '/demo/pagination', label: 'Pagination' },
	{ path: '/demo/empty-state', label: 'Empty State' },
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
			<h1 {...styles.title()}>Demo</h1>
			{demoPages.map((page) => (
				<Link key={page.path} to={page.path} {...styles.link()}>
					{page.label}
				</Link>
			))}
		</div>
	)
}

namespace styles {
	export const page = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		flexGrow: 1,
		gap: '16',
		justifyContent: 'center',
		paddingBottom: '32',
		paddingTop: '64',
		typography: 'body.b3',
	})

	export const title = style({ color: 'content.secondary' })

	export const link = style({
		color: 'content.primary',
		selectors: { '&:active': { transform: 'translateY(0.5px)' } },
	})
}
