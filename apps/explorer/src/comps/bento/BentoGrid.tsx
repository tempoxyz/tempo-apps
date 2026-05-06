import type * as React from 'react'
import { cx } from '#lib/css'

/**
 * Compact masonry grid for the landing bento. At every breakpoint the grid is
 * wide enough (2 / 4 / 6 cols) for tiles of mixed sizes (1×1 / 2×1 / 1×2 / 2×2)
 * to pack side-by-side via `grid-auto-flow: dense`.
 */
export function BentoGrid(props: BentoGrid.Props): React.JSX.Element {
	const { children, className } = props
	return (
		<div
			className={cx(
				'grid w-full gap-2.5',
				'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6',
				'[grid-auto-flow:dense] [grid-auto-rows:minmax(104px,auto)]',
				className,
			)}
		>
			{children}
		</div>
	)
}

export declare namespace BentoGrid {
	type Props = {
		children: React.ReactNode
		className?: string
	}
}
