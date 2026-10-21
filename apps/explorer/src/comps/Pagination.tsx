import { Link } from '@tanstack/react-router'
import { LoadingDots, style, Pagination as TdsPagination } from '@tempoxyz/ds'

/**
 * Page links for a paged list, with the item count beside them. Each page is
 * a URL (`?page=n`), so pages survive a reload and work with Back.
 */
export function Pagination(props: Pagination.Props): React.JSX.Element {
	const {
		page,
		pages,
		range,
		totalItems,
		itemsLabel,
		compact = false,
		hideOnSinglePage = true,
	} = props

	const count = (
		<Pagination.Count
			range={pages > 1 ? range : undefined}
			totalItems={totalItems}
			itemsLabel={itemsLabel}
		/>
	)

	if (hideOnSinglePage && pages <= 1)
		return <div {...styles.root()}>{count}</div>

	const previous = page > 1 ? page - 1 : undefined
	const next = page < pages ? page + 1 : undefined
	let gaps = 0
	// Below 640px, and for ranges too long for page links, Previous and Next
	// frame a "Page 1 of 3" label instead.
	const narrow = (
		<TdsPagination size="small">
			<Pagination.Step direction="previous" page={previous} />
			<TdsPagination.Ellipsis>
				Page {Pagination.numFormat.format(page)} of{' '}
				{Pagination.numFormat.format(pages)}
			</TdsPagination.Ellipsis>
			<Pagination.Step direction="next" page={next} />
		</TdsPagination>
	)

	if (compact || pages > 999)
		return (
			<div {...styles.root()}>
				{count}
				{narrow}
			</div>
		)

	return (
		<div {...styles.root()}>
			{count}
			{/* Both layouts render, and `display: none` keeps only the visible one in the accessibility tree. */}
			<div {...styles.wide()}>
				<TdsPagination size="small">
					<Pagination.Step direction="previous" page={previous} />
					{Pagination.getPagination(page, pages).map((item) =>
						item === Pagination.Ellipsis ? (
							<TdsPagination.Ellipsis key={`gap-${gaps++}`} />
						) : (
							<TdsPagination.Page
								key={item}
								aria-label={`Page ${Pagination.numFormat.format(item)}`}
								current={item === page}
								render={<Pagination.PageLink page={item} />}
							>
								{Pagination.numFormat.format(item)}
							</TdsPagination.Page>
						),
					)}
					<Pagination.Step direction="next" page={next} />
				</TdsPagination>
			</div>
			<div {...styles.narrow()}>{narrow}</div>
		</div>
	)
}

export namespace Pagination {
	export interface Props {
		page: number
		pages: number
		/** The first and last item numbers on screen, shown before the total. */
		range?: readonly [number, number] | undefined
		totalItems: number
		itemsLabel: string
		/** Shows Previous and Next around a "Page 1 of 3" label at every width. */
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

	/** The first, last and current pages with the current page's neighbors, about seven items. */
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

	/** A router link to `page`, keeping the other search params and the scroll position. */
	export function PageLink(props: PageLink.Props): React.JSX.Element {
		const { page, ...rest } = props
		return (
			<Link
				to="."
				resetScroll={false}
				search={(previous) => ({ ...previous, page })}
				{...rest}
			/>
		)
	}

	export declare namespace PageLink {
		type Props = Omit<React.ComponentProps<'a'>, 'href'> & { page: number }
	}

	/**
	 * Previous or Next, linking to `page`. Without a page it renders disabled,
	 * in place, so the page links do not shift.
	 */
	export function Step(props: Step.Props): React.JSX.Element {
		const { direction, page, ...rest } = props
		const Part =
			direction === 'previous' ? TdsPagination.Previous : TdsPagination.Next
		if (page === undefined) return <Part disabled />
		return <Part render={<PageLink page={page} {...rest} />} />
	}

	export declare namespace Step {
		type Props = Omit<PageLink.Props, 'page'> & {
			direction: 'previous' | 'next'
			page: number | undefined
		}
	}

	/** Previous and Next around a "Page 1 of 3" label, for lists without page links. */
	export function Simple(props: Simple.Props): React.JSX.Element | null {
		const {
			page,
			pages,
			pagesCapped = false,
			countLoading = false,
			onPrefetchNext,
			onCancelPrefetchNext,
			showPageLabel = true,
		} = props
		const total = typeof pages === 'number' ? pages : undefined

		if (total !== undefined && total <= 1 && page === 1 && !countLoading)
			return null

		// When capped, `pages` reflects the cap (e.g. 1,000) but its final page
		// isn't addressable upstream, so show it as "1,000+" and stop Next at
		// `pages - 1` (the last requestable page).
		const hasNext =
			typeof pages === 'number'
				? page < (pagesCapped ? pages - 1 : pages)
				: Boolean(pages?.hasMore)
		const label =
			total === undefined || countLoading || total < 1
				? `Page ${numFormat.format(page)}`
				: `Page ${numFormat.format(page)} of ${numFormat.format(total)}${pagesCapped ? '+' : ''}`

		return (
			<TdsPagination size="small">
				<Step direction="previous" page={page > 1 ? page - 1 : undefined} />
				{showPageLabel && (
					<TdsPagination.Ellipsis>{label}</TdsPagination.Ellipsis>
				)}
				<Step
					direction="next"
					page={hasNext ? page + 1 : undefined}
					onMouseEnter={onPrefetchNext}
					onFocus={onPrefetchNext}
					onMouseLeave={onCancelPrefetchNext}
					onBlur={onCancelPrefetchNext}
				/>
			</TdsPagination>
		)
	}

	export namespace Simple {
		export interface Props {
			page: number
			/** Total pages (number) or indefinite pagination ({ hasMore: boolean }) */
			pages?: number | { hasMore: boolean }
			/** Show the total page count as a capped value (e.g. "1,000+"). */
			pagesCapped?: boolean
			countLoading?: boolean
			onPrefetchNext?: () => void
			onCancelPrefetchNext?: () => void
			showPageLabel?: boolean | undefined
		}
	}

	/**
	 * The rows on screen and the total, such as "51–75 of 1,204 transactions",
	 * or the total alone without a `range`.
	 */
	export function Count(props: Count.Props): React.JSX.Element {
		const {
			range,
			totalItems,
			itemsLabel,
			loading = false,
			capped = false,
			className,
		} = props
		const shown = range
			? `${numFormat.format(range[0])}–${numFormat.format(range[1])} of `
			: ''

		return (
			<div {...styles.count({ className })}>
				{loading ? (
					<>
						{shown}
						<LoadingDots aria-label={`Counting ${itemsLabel}`} size="small" />
						{` ${itemsLabel}`}
					</>
				) : (
					`${shown}${numFormat.format(totalItems)}${capped ? '+' : ''} ${pluralize(totalItems, itemsLabel)}`
				)}
			</div>
		)
	}

	export namespace Count {
		export interface Props {
			/** The first and last item numbers on screen, from 1. */
			range?: readonly [number, number] | undefined
			totalItems: number
			itemsLabel: string
			loading?: boolean
			capped?: boolean
			className?: string
		}
	}
}

namespace styles {
	export const root = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		justifyContent: 'space-between',
	})

	export const wide = style({
		display: 'none',
		'@media 640': { display: 'block' },
	})

	export const narrow = style({ '@media 640': { display: 'none' } })

	export const count = style({ color: 'gray.900', typography: 'label.13' })
}
