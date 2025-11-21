import { Link } from '@tanstack/react-router'
import { cx } from '#cva.config.ts'
import ChevronLeft from '~icons/lucide/chevron-left'
import ChevronRight from '~icons/lucide/chevron-right'

/**
 * useful links:
 * - `<Link search />` https://tanstack.com/router/v1/docs/framework/react/guide/search-params#link-search-
 */

export function Pagination(props: Pagination.Props) {
	const {
		page,
		totalPages,
		totalItems,
		itemsLabel,
		isPending,
		compact = false,
	} = props

	if (compact)
		return (
			<div className="flex items-center justify-center gap-[8px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary w-full">
				<Link
					to="."
					resetScroll={false}
					search={(previous) => ({
						...previous,
						page: (previous?.page ?? 1) - 1,
					})}
					disabled={page <= 1 || isPending}
					className={cx(
						'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
					)}
					aria-label="Previous page"
				>
					<ChevronLeft className="size-[14px]" />
				</Link>

				<span className="text-primary font-medium">
					Page {page} of {totalPages}
				</span>

				<Link
					to="."
					type="button"
					resetScroll={false}
					search={(previous) => ({
						...previous,
						page: (previous?.page ?? 1) + 1,
					})}
					disabled={page >= totalPages || isPending}
					className={cx(
						'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
					)}
					aria-label="Next page"
				>
					<ChevronRight className="size-[14px]" />
				</Link>
			</div>
		)

	return (
		<div className="flex flex-col gap-[12px] border-t border-dashed border-card-border px-[16px] py-[12px] text-[12px] text-tertiary md:flex-row md:items-center md:justify-between">
			<div className="flex flex-row items-center gap-[8px] mx-auto md:mx-0">
				<Link
					to="."
					resetScroll={false}
					search={(previous) => ({
						...previous,
						page: (previous?.page ?? 1) - 1,
					})}
					disabled={page <= 1 || isPending}
					className={cx(
						'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[28px] text-primary',
					)}
					aria-label="Previous page"
				>
					<ChevronLeft className="size-[16px]" />
				</Link>

				<div className="flex items-center gap-[6px]">
					{(() => {
						const pages = Pagination.getPagination(page, totalPages)
						let ellipsisCount = 0

						return pages.map((p) => {
							if (p === Pagination.Ellipsis)
								return (
									<span
										key={`ellipsis-${ellipsisCount++}`}
										className="text-tertiary flex w-[28px] h-[28px] items-center justify-center"
									>
										…
									</span>
								)

							return (
								<Link
									key={p}
									to="."
									resetScroll={false}
									disabled={page === p || isPending}
									search={(previous) => ({ ...previous, page: p })}
									className={`rounded-[4px] flex w-[28px] h-[28px] items-center justify-center ${
										page === p
											? 'border border-accent/50 text-primary cursor-default'
											: 'cursor-pointer press-down hover:bg-alt text-primary'
									} ${isPending && page !== p ? 'opacity-50 cursor-not-allowed' : ''}`}
								>
									{p}
								</Link>
							)
						})
					})()}
				</div>

				<Link
					to="."
					resetScroll={false}
					search={(previous) => ({
						...previous,
						page: (previous?.page ?? 1) + 1,
					})}
					disabled={page >= totalPages || isPending}
					className={cx(
						'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[28px] text-primary',
					)}
					aria-label="Next page"
				>
					<ChevronRight className="size-[16px]" />
				</Link>
			</div>

			<div className="space-x-[8px]">
				<span className="text-tertiary">Page</span>
				<span className="text-primary">{page}</span>
				<span className="text-tertiary">of</span>
				<span className="text-primary">{totalPages}</span>
				<span className="text-tertiary">•</span>
				<span className="text-primary">{totalItems || '…'}</span>
				<span className="text-tertiary">
					{totalItems === 1 ? itemsLabel.replace(/s$/, '') : itemsLabel}
				</span>
			</div>
		</div>
	)
}

export namespace Pagination {
	export interface Props {
		page: number
		totalPages: number
		totalItems: number
		itemsLabel: string
		isPending: boolean
		compact?: boolean
	}

	export const Ellipsis = -1

	export function getPagination(page: number, totalPages: number): number[] {
		if (totalPages <= 7)
			return Array.from({ length: totalPages }, (_, i) => i + 1)

		if (page <= 4)
			return [
				...Array.from({ length: 5 }, (_, i) => i + 1),
				Ellipsis,
				totalPages,
			]

		if (page >= totalPages - 3)
			return [
				1,
				Ellipsis,
				...Array.from({ length: 5 }, (_, i) => totalPages - 4 + i),
			]

		return [1, Ellipsis, page - 1, page, page + 1, Ellipsis, totalPages]
	}
}
