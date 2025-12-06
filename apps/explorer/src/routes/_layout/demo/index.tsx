import { createFileRoute, Link, notFound } from '@tanstack/react-router'

const demoPages = [
	{ path: '/demo/tx', label: 'Transaction' },
	{ path: '/demo/address', label: 'Address' },
	{ path: '/demo/pagination', label: 'Pagination' },
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
		<div className="font-mono text-[13px] flex flex-col items-center justify-center gap-4 pt-16 pb-8 grow">
			<h1 className="text-tertiary uppercase">Demo</h1>
			{demoPages.map((page) => (
				<Link
					key={page.path}
					to={page.path}
					className="text-primary press-down"
				>
					{page.label}
				</Link>
			))}
		</div>
	)
}
