import { createFileRoute, notFound } from '@tanstack/react-router'
import { Pagination } from '#components/ui/Pagination.tsx'

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
		totalPages: 1,
		page: 1,
		totalItems: 0,
		label: '0 items, hideOnSinglePage',
		hideOnSinglePage: true,
	},
	{
		totalPages: 1,
		page: 1,
		totalItems: 1,
		label: '1 item, hideOnSinglePage',
		hideOnSinglePage: true,
	},
	{ totalPages: 1, page: 1, label: '1 page', hideOnSinglePage: false },
	{ totalPages: 2, page: 1, label: '2 pages' },
	{ totalPages: 7, page: 4, label: '7 pages' },
	{ totalPages: 999, page: 500, label: '999 pages (max before compact)' },
	{ totalPages: 1000, page: 1, label: '1,000 pages (compact: start)' },
	{ totalPages: 1000000, page: 500000, label: '1,000,000 pages (compact)' },
]

function Component() {
	return (
		<div className="font-mono text-[13px] flex flex-col items-center gap-8 pt-16 pb-8 grow">
			<h1 className="text-tertiary uppercase">Pagination</h1>
			<div className="flex flex-col gap-6 w-full max-w-[800px]">
				{examples.map((example) => (
					<div
						key={example.label}
						className="border border-card-border rounded-[10px] overflow-hidden"
					>
						<div className="px-[16px] py-[8px] bg-card-header text-tertiary text-[12px]">
							{example.label}
						</div>
						<div className="bg-card">
							<Pagination
								page={example.page}
								totalPages={example.totalPages}
								totalItems={example.totalItems ?? example.totalPages * 10}
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
