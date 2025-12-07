import { Link } from '@tanstack/react-router'
import { cx } from '#cva.config.ts'
import ChevronFirst from '~icons/lucide/chevron-first'
import ChevronLast from '~icons/lucide/chevron-last'
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
		itemsLabel: itemsLabel_,
		isPending,
		compact: compact_,
		hideOnSinglePage = true,
	} = props

	const compact = compact_ || totalPages > 999

	// TODO: better pluralization
	const itemsLabel =
		totalItems === 1 ? itemsLabel_.replace(/s$/, '') : itemsLabel_

	if (hideOnSinglePage && totalPages <= 1)
		return (
			<div className="flex items-center justify-end px-[16px] py-[12px] text-[12px] text-tertiary">
				<span className="text-primary tabular-nums">
					{Pagination.numFormat.format(totalItems)}
				</span>
				<span className="ml-[8px]">{itemsLabel}</span>
			</div>
		)

	if (compact)
		return (
			<div className="flex flex-col items-center gap-[12px] sm:flex-row sm:justify-between px-[16px] py-[12px] text-[12px] text-tertiary w-full">
				<div className="flex items-center gap-[6px]">
					<Link
						to="."
						resetScroll={false}
						search={(previous) => ({ ...previous, page: 1 })}
						disabled={page <= 1 || isPending}
						className={cx(
							'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer press-down aria-disabled:cursor-default aria-disabled:opacity-50 size-[24px] text-primary',
						)}
						title="First page"
					>
						<ChevronFirst className="size-[14px]" />
					</Link>

					<Link
						to="."
						resetScroll={false}
						search={(previous) => ({
							...previous,
							page: (previous?.page ?? 1) - 1,
						})}
						disabled={page <= 1 || isPending}
						className={cx(
							'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer press-down aria-disabled:cursor-default aria-disabled:opacity-50 size-[24px] text-primary',
						)}
						title="Previous page"
					>
						<ChevronLeft className="size-[14px]" />
					</Link>

					<span className="text-primary font-medium tabular-nums px-[4px] whitespace-nowrap">
						Page {Pagination.numFormat.format(page)} of{' '}
						{Pagination.numFormat.format(totalPages)}
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
							'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer press-down aria-disabled:cursor-default aria-disabled:opacity-50 size-[24px] text-primary',
						)}
						title="Next page"
					>
						<ChevronRight className="size-[14px]" />
					</Link>

					<Link
						to="."
						type="button"
						resetScroll={false}
						search={(previous) => ({
							...previous,
							page: totalPages,
						})}
						disabled={page >= totalPages || isPending}
						className={cx(
							'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer press-down aria-disabled:cursor-default aria-disabled:opacity-50 size-[24px] text-primary',
						)}
						title="Last page"
					>
						<ChevronLast className="size-[14px]" />
					</Link>
				</div>

				<Pagination.Count totalItems={totalItems} itemsLabel={itemsLabel} />
			</div>
		)

	return (
		<div className="flex flex-col gap-[12px] px-[16px] py-[12px] text-[12px] text-tertiary md:flex-row md:items-center md:justify-between">
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
						'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer press-down aria-disabled:cursor-default aria-disabled:opacity-50 size-[28px] text-primary',
					)}
					title="Previous page"
				>
					<ChevronLeft className="size-[16px]" />
				</Link>

				<div className="flex items-center gap-[6px]">
					{(() => {
						const pages = Pagination.getPagination(page, totalPages)
						let ellipsisCount = 0

						return pages.map((p) =>
							p === Pagination.Ellipsis ? (
								<span
									key={`ellipsis-${ellipsisCount++}`}
									className="text-tertiary flex w-[28px] h-[28px] items-center justify-center"
								>
									…
								</span>
							) : (
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
							),
						)
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
						'rounded-full! border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer press-down aria-disabled:cursor-default aria-disabled:opacity-50 size-[28px] text-primary',
					)}
					title="Next page"
				>
					<ChevronRight className="size-[16px]" />
				</Link>
			</div>

			<Pagination.Count
				page={page}
				totalPages={totalPages}
				totalItems={totalItems}
				itemsLabel={itemsLabel}
			/>
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
		hideOnSinglePage?: boolean
	}

	export const Ellipsis = -1

	export const numFormat = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})

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

	export function Simple(props: Simple.Props) {
		const { page, totalPages, isPending } = props
		return (
			<div className="flex items-center justify-center sm:justify-start gap-[6px]">
				<Link
					to="."
					resetScroll={false}
					search={(prev) => ({ ...prev, page: 1 })}
					disabled={page <= 1 || isPending}
					className={cx(
						'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
					)}
					title="First page"
				>
					<ChevronFirst className="size-[14px]" />
				</Link>
				<Link
					to="."
					resetScroll={false}
					search={(prev) => ({ ...prev, page: (prev?.page ?? 1) - 1 })}
					disabled={page <= 1 || isPending}
					className={cx(
						'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
					)}
					title="Previous page"
				>
					<ChevronLeft className="size-[14px]" />
				</Link>
				<span className="text-primary font-medium tabular-nums px-[4px] whitespace-nowrap">
					Page {Pagination.numFormat.format(page)} of{' '}
					{Pagination.numFormat.format(totalPages)}
				</span>
				<Link
					to="."
					resetScroll={false}
					search={(prev) => ({ ...prev, page: (prev?.page ?? 1) + 1 })}
					disabled={page >= totalPages || isPending}
					className={cx(
						'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
					)}
					title="Next page"
				>
					<ChevronRight className="size-[14px]" />
				</Link>
				<Link
					to="."
					resetScroll={false}
					search={(prev) => ({ ...prev, page: totalPages })}
					disabled={page >= totalPages || isPending}
					className={cx(
						'rounded-full border border-base-border hover:bg-alt flex items-center justify-center cursor-pointer active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-50 size-[24px] text-primary',
					)}
					title="Last page"
				>
					<ChevronLast className="size-[14px]" />
				</Link>
			</div>
		)
	}

	export namespace Simple {
		export interface Props {
			page: number
			totalPages: number
			isPending?: boolean
		}
	}

	export function Count(props: Count.Props) {
		const { page, totalPages, totalItems, itemsLabel } = props
		return (
			<div className="flex items-center justify-center sm:justify-end gap-[8px]">
				{page != null && totalPages != null && (
					<>
						<span className="text-tertiary">Page</span>
						<span className="text-primary">{page}</span>
						<span className="text-tertiary">of</span>
						<span className="text-primary">{totalPages}</span>
						<span className="text-tertiary">•</span>
					</>
				)}
				<span className="text-primary tabular-nums">
					{Pagination.numFormat.format(totalItems)}
				</span>
				<span className="text-tertiary">{itemsLabel}</span>
			</div>
		)
	}

	export namespace Count {
		export interface Props {
			page?: number
			totalPages?: number
			totalItems: number
			itemsLabel: string
		}
	}
}
