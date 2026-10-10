import { createFileRoute, notFound } from '@tanstack/react-router'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { useMediaQuery } from '#lib/hooks'
import { styles } from './-empty-state.styles'

function loader() {
	if (import.meta.env.VITE_ENABLE_DEMO !== 'true') throw notFound()
	return {}
}

export const Route = createFileRoute('/_layout/demo/empty-state')({
	component: Component,
	loader,
})

function Component() {
	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	const columns: DataGrid.Column[] = [
		{ label: 'Name', align: 'start' },
		{ label: 'Status', align: 'start' },
		{ label: 'Amount', align: 'end' },
	]

	return (
		<div {...styles.page()}>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Empty State Demo',
						totalItems: 0,
						itemsLabel: 'transactions',
						content: (
							<DataGrid
								columns={{ stacked: columns, tabs: columns }}
								items={() => []}
								totalItems={0}
								page={1}
								itemsLabel="transactions"
								emptyState="No transactions found."
							/>
						),
					},
				]}
				activeSection={0}
			/>
		</div>
	)
}
