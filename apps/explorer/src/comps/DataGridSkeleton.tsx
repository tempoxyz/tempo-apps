import * as React from 'react'
import { DataGrid } from '#comps/DataGrid'

export function DataGridSkeleton(props: {
	columns: DataGrid.Column[]
	rows?: number
	totalItems?: number
	itemsLabel?: string
}) {
	const { columns, rows = 10, totalItems = 0, itemsLabel = 'items' } = props

	const id = React.useId()

	return (
		<DataGrid
			columns={{ stacked: columns, tabs: columns }}
			items={() =>
				Array.from({ length: rows }, (_, index) => ({
					cells: columns.map((_, colIndex) => (
						<div
							key={`skeleton-${index}-${colIndex}-${id}`}
							className="h-[20px]"
						/>
					)),
				}))
			}
			totalItems={totalItems}
			page={1}
			isPending={false}
			itemsLabel={itemsLabel}
			itemsPerPage={rows}
		/>
	)
}
