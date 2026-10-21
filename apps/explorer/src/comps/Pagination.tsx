import { Link } from '@tanstack/react-router'
import { Pagination as TdsPagination, style, Tooltip } from '@tempoxyz/ds'
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from '@tempoxyz/ds/icons'
import { cx } from 'zyzz'
import { useMediaQuery } from '#lib/hooks'
import { pressDown } from '#styles/explorer'

/**
 * useful links:
 * - `<Link search />` https://tanstack.com/router/v1/docs/framework/react/guide/search-params#link-search-
 */

export function Pagination(props: Pagination.Props): React.JSX.Element {
	const {
		page,
		pages,
		totalItems,
		itemsLabel: itemsLabel_,
		isPending,
		compact: compact_,
		hideOnSinglePage = true,
	} = props

	const isNarrow = useMediaQuery('(max-width: 479px)')
	const compact = compact_ || pages > 999 || isNarrow

	const itemsLabel = Pagination.pluralize(totalItems, itemsLabel_)

	if (hideOnSinglePage && pages <= 1)
		return (
			<div {...styles.single()}>
				<span {...styles.number()}>
					{Pagination.numFormat.format(totalItems)}
				</span>
				<span {...styles.singleLabel()}>{itemsLabel}</span>
			</div>
		)

	if (compact)
		return (
			<div {...styles.compact()}>
				<div {...styles.compactNav()}>
					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Link
									aria-label="First page"
									to="."
									resetScroll={false}
									search={(previous) => ({ ...previous, page: 1 })}
									disabled={page <= 1 || isPending}
									{...cx(styles.navButton(), pressDown())}
								/>
							}
						>
							<ChevronsLeft />
						</Tooltip.Trigger>
						<Tooltip.Popup>First page</Tooltip.Popup>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Link
									aria-label="Previous page"
									to="."
									resetScroll={false}
									search={(previous) => ({
										...previous,
										page: (previous?.page ?? 1) - 1,
									})}
									disabled={page <= 1 || isPending}
									{...cx(styles.navButton(), pressDown())}
								/>
							}
						>
							<ChevronLeft />
						</Tooltip.Trigger>
						<Tooltip.Popup>Previous page</Tooltip.Popup>
					</Tooltip.Root>

					<span {...styles.compactLabel()}>
						Page{' '}
						<span {...styles.primary()}>
							{Pagination.numFormat.format(page)}
						</span>{' '}
						of {Pagination.numFormat.format(pages)}
					</span>

					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Link
									aria-label="Next page"
									to="."
									resetScroll={false}
									search={(previous) => ({
										...previous,
										page: (previous?.page ?? 1) + 1,
									})}
									disabled={page >= pages || isPending}
									{...cx(styles.navButton(), pressDown())}
								/>
							}
						>
							<ChevronRight />
						</Tooltip.Trigger>
						<Tooltip.Popup>Next page</Tooltip.Popup>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Link
									aria-label="Last page"
									to="."
									resetScroll={false}
									search={(previous) => ({ ...previous, page: pages })}
									disabled={page >= pages || isPending}
									{...cx(styles.navButton(), pressDown())}
								/>
							}
						>
							<ChevronsRight />
						</Tooltip.Trigger>
						<Tooltip.Popup>Last page</Tooltip.Popup>
					</Tooltip.Root>
				</div>

				<Pagination.Count totalItems={totalItems} itemsLabel={itemsLabel} />
			</div>
		)

	return (
		<div {...styles.full()}>
			<div {...styles.fullNav()}>
				<Tooltip.Root>
					<Tooltip.Trigger
						render={
							<Link
								aria-label="Previous page"
								to="."
								resetScroll={false}
								search={(previous) => ({
									...previous,
									page: (previous?.page ?? 1) - 1,
								})}
								disabled={page <= 1 || isPending}
								{...cx(styles.navButton(), pressDown())}
							/>
						}
					>
						<ChevronLeft />
					</Tooltip.Trigger>
					<Tooltip.Popup>Previous page</Tooltip.Popup>
				</Tooltip.Root>

				<TdsPagination size="small">
					{(() => {
						const pageNumbers = Pagination.getPagination(page, pages)
						let ellipsisCount = 0

						return pageNumbers.map((p) =>
							p === Pagination.Ellipsis ? (
								<TdsPagination.Ellipsis key={`ellipsis-${ellipsisCount++}`} />
							) : (
								<TdsPagination.Page
									key={p}
									current={page === p}
									render={
										<Link
											to="."
											resetScroll={false}
											disabled={page === p || isPending}
											search={(previous) => ({ ...previous, page: p })}
										/>
									}
									{...(isPending && page !== p ? styles.pagePending() : {})}
								>
									{p}
								</TdsPagination.Page>
							),
						)
					})()}
				</TdsPagination>

				<Tooltip.Root>
					<Tooltip.Trigger
						render={
							<Link
								aria-label="Next page"
								to="."
								resetScroll={false}
								search={(previous) => ({
									...previous,
									page: (previous?.page ?? 1) + 1,
								})}
								disabled={page >= pages || isPending}
								{...cx(styles.navButton(), pressDown())}
							/>
						}
					>
						<ChevronRight />
					</Tooltip.Trigger>
					<Tooltip.Popup>Next page</Tooltip.Popup>
				</Tooltip.Root>
			</div>

			<Pagination.Count
				page={page}
				pages={pages}
				totalItems={totalItems}
				itemsLabel={itemsLabel}
			/>
		</div>
	)
}

export namespace Pagination {
	export interface Props {
		page: number
		pages: number
		totalItems: number
		itemsLabel: string
		isPending: boolean
		compact?: boolean
		hideOnSinglePage?: boolean
	}

	export const Ellipsis = -1

	const uncountable = new Set(['data'])
	const irregulars: Record<string, string> = {
		txns: 'txn',
	}

	export function pluralize(count: number | string, label: string) {
		if (Number(count) !== 1) return label
		if (uncountable.has(label)) return label
		if (label in irregulars) return irregulars[label]
		return label.replace(/s$/, '')
	}

	export const numFormat = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})

	export function getPagination(page: number, pages: number): number[] {
		if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)

		if (page <= 4)
			return [...Array.from({ length: 5 }, (_, i) => i + 1), Ellipsis, pages]

		if (page >= pages - 3)
			return [
				1,
				Ellipsis,
				...Array.from({ length: 5 }, (_, i) => pages - 4 + i),
			]

		return [1, Ellipsis, page - 1, page, page + 1, Ellipsis, pages]
	}

	export function Simple(props: Simple.Props) {
		const {
			page,
			pages,
			pagesCapped = false,
			fetching,
			countLoading,
			disableLastPage,
			onPrefetchNext,
			onCancelPrefetchNext,
			showPageLabel = true,
		} = props
		const isIndefinite = typeof pages !== 'number'

		// When capped, `pages` reflects the cap (e.g. 1,000) but its final page
		// isn't addressable upstream, so show it as "1,000+" and clamp navigation
		// to `pages - 1` (the last requestable page).
		const totalPagesLabel =
			isIndefinite || countLoading
				? '…'
				: typeof pages === 'number' && pages > 0
					? pagesCapped
						? `${Pagination.numFormat.format(pages)}+`
						: Pagination.numFormat.format(pages)
					: '…'
		const disableNext = isIndefinite
			? !(pages as { hasMore: boolean } | undefined)?.hasMore
			: pagesCapped
				? page >= pages - 1
				: page >= pages

		const handlePrefetchNext = () => {
			if (disableNext) return
			onPrefetchNext?.()
		}

		// Hide pagination controls on single page (but not during indefinite loading)
		const isSinglePage =
			!isIndefinite && typeof pages === 'number' && pages <= 1 && page === 1
		if (isSinglePage && !countLoading) return <div />

		return (
			<div {...styles.simple()}>
				<Tooltip.Root>
					<Tooltip.Trigger
						render={
							<Link
								aria-label="First page"
								to="."
								resetScroll={false}
								search={(prev) => ({ ...prev, page: 1 })}
								disabled={page <= 1}
								{...cx(styles.navButton(), pressDown())}
							/>
						}
					>
						<ChevronsLeft />
					</Tooltip.Trigger>
					<Tooltip.Popup>First page</Tooltip.Popup>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger
						render={
							<Link
								aria-label="Previous page"
								to="."
								resetScroll={false}
								search={(prev) => ({
									...prev,
									page: (prev?.page ?? 1) - 1,
								})}
								disabled={page <= 1}
								{...cx(styles.navButton(), pressDown())}
							/>
						}
					>
						<ChevronLeft />
					</Tooltip.Trigger>
					<Tooltip.Popup>Previous page</Tooltip.Popup>
				</Tooltip.Root>
				{showPageLabel && (
					<span {...styles.simpleLabel()}>
						<span {...cx(styles.primary(), fetching && styles.fetching())}>
							{Pagination.numFormat.format(page)}
						</span>
						{' of '}
						{totalPagesLabel}
					</span>
				)}
				<Tooltip.Root>
					<Tooltip.Trigger
						render={
							<Link
								aria-label="Next page"
								to="."
								resetScroll={false}
								search={(prev) => ({
									...prev,
									page: (prev?.page ?? 1) + 1,
								})}
								onMouseEnter={handlePrefetchNext}
								onFocus={handlePrefetchNext}
								onMouseLeave={onCancelPrefetchNext}
								onBlur={onCancelPrefetchNext}
								disabled={disableNext}
								{...cx(styles.navButton(), pressDown())}
							/>
						}
					>
						<ChevronRight />
					</Tooltip.Trigger>
					<Tooltip.Popup>Next page</Tooltip.Popup>
				</Tooltip.Root>
				{typeof pages === 'number' && !pagesCapped && (
					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Link
									aria-label="Last page"
									to="."
									resetScroll={false}
									search={(prev) => ({ ...prev, page: pages })}
									disabled={page >= pages || disableLastPage}
									{...cx(styles.navButton(), pressDown())}
								/>
							}
						>
							<ChevronsRight />
						</Tooltip.Trigger>
						<Tooltip.Popup>Last page</Tooltip.Popup>
					</Tooltip.Root>
				)}
			</div>
		)
	}

	export namespace Simple {
		export interface Props {
			page: number
			/** Total pages (number) or indefinite pagination ({ hasMore: boolean }) */
			pages?: number | { hasMore: boolean }
			/** Show the total page count as a capped value (e.g. "1,000+"). */
			pagesCapped?: boolean
			fetching?: boolean
			countLoading?: boolean
			/** Disable "Last page" button when we can't reliably navigate there */
			disableLastPage?: boolean
			onPrefetchNext?: () => void
			onCancelPrefetchNext?: () => void
			showPageLabel?: boolean | undefined
		}
	}

	export function Count(props: Count.Props) {
		const {
			page,
			pages,
			totalItems,
			itemsLabel: itemsLabel_,
			loading,
			capped,
			className,
		} = props
		const itemsLabel = loading
			? itemsLabel_
			: Pagination.pluralize(totalItems, itemsLabel_)

		return (
			<div {...styles.count({ className })}>
				{page != null && pages != null && (
					<>
						<span {...styles.number()}>
							{Pagination.numFormat.format(page)}
						</span>
						<span>of</span>
						<span {...styles.number()}>
							{Pagination.numFormat.format(pages)}
						</span>
						<span aria-hidden="true" {...styles.separator()}>
							•
						</span>
					</>
				)}
				<span {...styles.number()}>
					{loading
						? '…'
						: `${capped ? '> ' : ''}${Pagination.numFormat.format(totalItems)}`}
				</span>
				<span>{itemsLabel}</span>
			</div>
		)
	}

	export namespace Count {
		export interface Props {
			page?: number
			pages?: number
			totalItems: number
			itemsLabel: string
			loading?: boolean
			capped?: boolean
			className?: string
		}
	}
}

namespace styles {
	export const single = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
		justifyContent: 'flex-end',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'label.12',
	})

	export const singleLabel = style({ marginLeft: '8' })

	export const number = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums',
	})

	export const primary = style({ color: 'foreground' })

	export const separator = style({ color: 'gray.700' })

	export const fetching = style({ opacity: 0.5 })

	// TDS small secondary icon Button geometry on TanStack `<Link>`s, which
	// keep `disabled` and search updates. TDS Button styles only `:disabled`.
	export const navButton = style({
		alignItems: 'center',
		backgroundColor: 'grayAlpha.100',
		borderRadius: '8',
		color: 'foreground',
		cursor: 'pointer',
		display: 'inline-flex',
		flexShrink: '0 !custom',
		height: '32',
		justifyContent: 'center',
		width: '32',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'grayAlpha.200' },
		},
		selectors: {
			'& > svg': { height: '16', width: '16' },
			'&[aria-disabled="true"]': {
				backgroundColor: 'grayAlpha.100',
				cursor: 'default',
				opacity: 0.4,
			},
		},
	})

	export const compact = style({
		alignItems: 'center',
		color: 'gray.900',
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'label.12',
		width: '100% !custom',
		'@media (width >= 640px)': {
			flexDirection: 'row',
			justifyContent: 'space-between',
		},
	})

	export const compactNav = style({
		display: 'grid',
		gap: '8',
		gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
		justifyItems: 'center',
		'@media (width >= 480px)': { alignItems: 'center', display: 'flex' },
	})

	export const compactLabel = style({
		fontVariantNumeric: 'tabular-nums',
		gridColumn: 'span 4 / span 4',
		gridRowStart: '1',
		paddingInline: '4',
		textAlign: 'center',
		whiteSpace: 'nowrap',
	})

	export const full = style({
		color: 'gray.900',
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'label.12',
		'@media (width >= 768px)': {
			alignItems: 'center',
			flexDirection: 'row',
			justifyContent: 'space-between',
		},
	})

	export const fullNav = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'row',
		gap: '8',
		marginInline: 'auto !custom',
		'@media (width >= 768px)': { marginInline: '0' },
	})

	// TDS `Pagination.Page` has no pending state.
	export const pagePending = style({ opacity: 0.5 })

	export const simple = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'center',
		'@media (width >= 640px)': { justifyContent: 'flex-start' },
	})

	export const simpleLabel = style({
		fontVariantNumeric: 'tabular-nums',
		paddingInline: '4',
		whiteSpace: 'nowrap',
	})

	export const count = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		justifyContent: 'center',
		'@media (width >= 640px)': { justifyContent: 'flex-end' },
	})
}
