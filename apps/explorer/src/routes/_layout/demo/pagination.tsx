import { createFileRoute, notFound } from '@tanstack/react-router'
import { Pagination } from '#comps/Pagination'
import { style } from '@tempoxyz/ds'

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

namespace styles {
	export const page = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		flexGrow: 1,
		gap: '8',
		paddingBottom: '8',
		paddingTop: '16',
		typography: 'label.12',
	})

	export const title = style({ color: 'gray.900' })

	export const examples = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '6',
		maxWidth: '800px !custom',
		width: '100% !custom',
	})

	export const example = style({
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		overflow: 'hidden',
	})

	export const exampleLabel = style({
		backgroundColor: 'background.surface',
		color: 'gray.900',
		paddingBlock: '2',
		paddingInline: '4',
		typography: 'label.12',
	})

	export const exampleBody = style({ backgroundColor: 'background.surface' })
}
