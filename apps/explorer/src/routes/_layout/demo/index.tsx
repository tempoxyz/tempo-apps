import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { cx } from 'zyzz'
import { pressDown } from '#styles/explorer'
import { styles } from './-index.styles'

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
				<Link
					key={page.path}
					to={page.path}
					{...cx(styles.link(), pressDown())}
				>
					{page.label}
				</Link>
			))}
		</div>
	)
}
