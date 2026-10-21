import { createFileRoute, notFound } from '@tanstack/react-router'
import { style, Surface } from '@tempoxyz/ds'
import { Pagination } from '#comps/Pagination'

function loader() {
	if (import.meta.env.VITE_ENABLE_DEMO !== 'true') throw notFound()
	return {}
}

export const Route = createFileRoute('/_layout/demo/pagination')({
	component: Component,
	loader,
})

const examples = [
	{
		pages: 1,
		page: 1,
		totalItems: 0,
		label: '0 items, hidden on a single page',
		hideOnSinglePage: true,
	},
	{
		pages: 1,
		page: 1,
		totalItems: 1,
		label: '1 item, hidden on a single page',
		hideOnSinglePage: true,
	},
	{ pages: 1, page: 1, label: '1 page', hideOnSinglePage: false },
	{ pages: 2, page: 1, label: '2 pages' },
	{ pages: 7, page: 4, label: '7 pages' },
	{ pages: 999, page: 500, label: '999 pages, the most before compact' },
	{ pages: 1000, page: 1, label: '1,000 pages, compact at the start' },
	{ pages: 1000000, page: 500000, label: '1,000,000 pages, compact' },
]

function Component() {
	return (
		<div {...styles.page()}>
			<h1 {...styles.title()}>Pagination</h1>
			{examples.map((example) => (
				<Surface key={example.label} size="small">
					<Surface.Header>
						<Surface.Title>{example.label}</Surface.Title>
					</Surface.Header>
					<Pagination
						page={example.page}
						pages={example.pages}
						totalItems={example.totalItems ?? example.pages * 10}
						itemsLabel="items"
						hideOnSinglePage={example.hideOnSinglePage}
					/>
				</Surface>
			))}
		</div>
	)
}

namespace styles {
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		marginInline: 'auto !custom',
		maxWidth: '800px !custom',
		paddingBottom: '32',
		paddingInline: '16',
		paddingTop: '64',
		width: '100% !custom',
	})

	export const title = style({
		color: 'foreground',
		margin: '0',
		typography: 'heading.24.subtle',
	})
}
