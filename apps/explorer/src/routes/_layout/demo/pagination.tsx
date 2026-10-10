import { createFileRoute, notFound } from '@tanstack/react-router'
import { Pagination } from '#comps/Pagination'
import { styles } from './-pagination.styles'

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
		label: '0 items, hideOnSinglePage',
		hideOnSinglePage: true,
	},
	{
		pages: 1,
		page: 1,
		totalItems: 1,
		label: '1 item, hideOnSinglePage',
		hideOnSinglePage: true,
	},
	{ pages: 1, page: 1, label: '1 page', hideOnSinglePage: false },
	{ pages: 2, page: 1, label: '2 pages' },
	{ pages: 7, page: 4, label: '7 pages' },
	{ pages: 999, page: 500, label: '999 pages (max before compact)' },
	{ pages: 1000, page: 1, label: '1,000 pages (compact: start)' },
	{ pages: 1000000, page: 500000, label: '1,000,000 pages (compact)' },
]

function Component() {
	return (
		<div {...styles.page()}>
			<h1 {...styles.title()}>Pagination</h1>
			<div {...styles.examples()}>
				{examples.map((example) => (
					<div key={example.label} {...styles.example()}>
						<div {...styles.exampleLabel()}>{example.label}</div>
						<div {...styles.exampleBody()}>
							<Pagination
								page={example.page}
								pages={example.pages}
								totalItems={example.totalItems ?? example.pages * 10}
								itemsLabel="items"
								isPending={false}
								hideOnSinglePage={example.hideOnSinglePage}
							/>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
