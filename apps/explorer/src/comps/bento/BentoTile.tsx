import { Link, type LinkProps } from '@tanstack/react-router'
import * as React from 'react'
import { cx } from '#lib/css'
import AlertTriangleIcon from '~icons/lucide/triangle-alert'
import ChevronDownIcon from '~icons/lucide/chevron-down'

// Enumerate classes explicitly so Tailwind JIT sees them statically.
const COL_BASE: Record<1 | 2, string> = {
	1: 'col-span-1',
	2: 'col-span-2',
}
const COL_SM: Record<1 | 2 | 3 | 4, string> = {
	1: 'sm:col-span-1',
	2: 'sm:col-span-2',
	3: 'sm:col-span-3',
	4: 'sm:col-span-4',
}
const COL_LG: Record<1 | 2 | 3 | 4 | 6, string> = {
	1: 'lg:col-span-1',
	2: 'lg:col-span-2',
	3: 'lg:col-span-3',
	4: 'lg:col-span-4',
	6: 'lg:col-span-6',
}
const ROW_BASE: Record<1 | 2, string> = {
	1: 'row-span-1',
	2: 'row-span-2',
}
const ROW_SM: Record<1 | 2 | 3, string> = {
	1: 'sm:row-span-1',
	2: 'sm:row-span-2',
	3: 'sm:row-span-3',
}
const ROW_LG: Record<1 | 2 | 3, string> = {
	1: 'lg:row-span-1',
	2: 'lg:row-span-2',
	3: 'lg:row-span-3',
}

export function BentoTile(props: BentoTile.Props): React.JSX.Element {
	const {
		children,
		title,
		titleAside,
		action,
		className,
		span = { base: 1, sm: 1, lg: 1 },
		rowSpan = { base: 1, lg: 1 },
		status,
		empty,
		contentClassName,
	} = props

	const spanClasses = cx(
		COL_BASE[span.base ?? 1],
		COL_SM[span.sm ?? span.base ?? 1],
		COL_LG[span.lg ?? span.sm ?? span.base ?? 1],
		ROW_BASE[rowSpan.base ?? 1],
		ROW_SM[rowSpan.sm ?? rowSpan.base ?? 1],
		ROW_LG[rowSpan.lg ?? rowSpan.sm ?? rowSpan.base ?? 1],
	)

	return (
		<section
			className={cx(
				'group/tile relative flex flex-col overflow-hidden',
				'rounded-[12px] border border-card-border bg-card',
				'transition-[border-color] duration-150',
				'hover:border-accent/30',
				spanClasses,
				className,
			)}
		>
			{(title || action || titleAside) && (
				<header className="flex h-8 items-center justify-between gap-2 px-3 pt-2.5 text-[11px] font-medium tracking-[-0.005em] text-tertiary">
					<span className="flex items-center gap-1.5 truncate">{title}</span>
					<span className="flex items-center gap-1.5 shrink-0">
						{titleAside ? (
							<span className="text-[10.5px] text-tertiary font-normal">
								{titleAside}
							</span>
						) : null}
						{action}
					</span>
				</header>
			)}
			<div
				className={cx(
					'flex flex-1 min-h-0 flex-col',
					'px-3 pb-3',
					!title && !action && !titleAside && 'pt-3',
					contentClassName,
				)}
			>
				{status === 'loading' ? (
					<BentoTile.Skeleton />
				) : status === 'error' ? (
					<BentoTile.Error />
				) : status === 'empty' ? (
					<BentoTile.Empty {...empty} />
				) : (
					children
				)}
			</div>
		</section>
	)
}

BentoTile.Skeleton = function BentoTileSkeleton(): React.JSX.Element {
	return (
		<div className="flex flex-1 flex-col justify-end gap-1.5">
			<div className="h-2.5 w-20 rounded-sm bg-base-alt animate-pulse" />
			<div className="h-5 w-32 rounded-sm bg-base-alt animate-pulse" />
			<div className="h-10 w-full rounded-sm bg-base-alt/60 animate-pulse" />
		</div>
	)
}

BentoTile.Error = function BentoTileError(): React.JSX.Element {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
			<AlertTriangleIcon className="size-5 text-tertiary opacity-50" />
			<span className="text-[11px] text-tertiary">Data unavailable</span>
		</div>
	)
}

BentoTile.Empty = function BentoTileEmpty(
	props: BentoTile.EmptyProps,
): React.JSX.Element {
	const { icon, label = 'No data yet' } = props
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center py-2">
			{icon ? (
				<span className="text-tertiary opacity-40 [&>svg]:size-6">{icon}</span>
			) : null}
			<span className="text-[11px] text-tertiary">{label}</span>
		</div>
	)
}

BentoTile.PillAction = function BentoTilePillAction(
	props: BentoTile.PillActionProps,
): React.JSX.Element {
	const { children, className, ...linkProps } = props
	return (
		<Link
			{...(linkProps as LinkProps)}
			className={cx(
				'inline-flex items-center gap-1 rounded-full border border-card-border bg-card',
				'px-2 py-[2px] text-[10.5px] font-medium text-secondary',
				'transition-colors hover:border-accent/40 hover:text-primary press-down-mini',
				className,
			)}
		>
			{children}
		</Link>
	)
}

BentoTile.PrimaryValue = function BentoTilePrimaryValue(
	props: BentoTile.PrimaryValueProps,
): React.JSX.Element {
	const { value, suffix, className } = props
	return (
		<span
			className={cx(
				'font-mono text-[22px] leading-none tracking-[-0.02em] text-primary tabular-nums inline-flex items-baseline',
				className,
			)}
		>
			{value}
			{suffix ? (
				<span className="ml-1 text-[14px] tracking-normal opacity-50">
					{suffix}
				</span>
			) : null}
		</span>
	)
}

BentoTile.SelectAction = function BentoTileSelectAction<T extends string>(
	props: BentoTile.SelectActionProps<T>,
): React.JSX.Element {
	const { value, options, onChange, ariaLabel } = props
	const [open, setOpen] = React.useState(false)
	const ref = React.useRef<HTMLDivElement>(null)
	const buttonId = React.useId()
	const listId = React.useId()

	React.useEffect(() => {
		if (!open) return
		const onPointerDown = (evt: PointerEvent) => {
			if (!ref.current) return
			if (ref.current.contains(evt.target as Node)) return
			setOpen(false)
		}
		const onKey = (evt: KeyboardEvent) => {
			if (evt.key === 'Escape') setOpen(false)
		}
		window.addEventListener('pointerdown', onPointerDown)
		window.addEventListener('keydown', onKey)
		return () => {
			window.removeEventListener('pointerdown', onPointerDown)
			window.removeEventListener('keydown', onKey)
		}
	}, [open])

	const current = options.find((o) => o.value === value) ?? options[0]

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				id={buttonId}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={listId}
				aria-label={ariaLabel}
				onClick={() => setOpen((v) => !v)}
				className={cx(
					'inline-flex items-center gap-1 rounded-full border border-card-border bg-card',
					'px-2 py-[2px] text-[10.5px] font-medium text-secondary',
					'transition-colors hover:border-accent/40 hover:text-primary press-down-mini',
				)}
			>
				<span className="truncate max-w-[80px]">{current?.label}</span>
				<ChevronDownIcon
					className={cx(
						'size-[10px] shrink-0 transition-transform duration-150',
						open && 'rotate-180',
					)}
				/>
			</button>
			{open ? (
				<ul
					id={listId}
					aria-labelledby={buttonId}
					className={cx(
						'absolute right-0 top-full z-10 mt-1 min-w-[110px]',
						'rounded-[8px] border border-card-border bg-card shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]',
						'py-1 text-[11px] motion-safe:animate-[fadeIn_120ms_ease-out_both]',
					)}
				>
					{options.map((opt) => (
						<li key={opt.value}>
							<button
								type="button"
								role="option"
								aria-selected={opt.value === value}
								onClick={() => {
									onChange(opt.value)
									setOpen(false)
								}}
								className={cx(
									'flex w-full items-center justify-between gap-2 px-2.5 py-1 text-left',
									'hover:bg-base-alt/70',
									opt.value === value ? 'text-primary' : 'text-secondary',
								)}
							>
								<span>{opt.label}</span>
								{opt.value === value ? (
									<span className="size-[5px] rounded-full bg-accent" />
								) : null}
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	)
}

export declare namespace BentoTile {
	type Span = {
		base?: 1 | 2
		sm?: 1 | 2 | 3 | 4
		lg?: 1 | 2 | 3 | 4 | 6
	}

	type RowSpanProp = {
		base?: 1 | 2
		sm?: 1 | 2 | 3
		lg?: 1 | 2 | 3
	}

	type Status = 'loading' | 'error' | 'ready' | 'empty'

	type EmptyProps = {
		icon?: React.ReactNode
		label?: React.ReactNode
	}

	type PillActionProps = React.ComponentProps<typeof Link> & {
		className?: string
	}

	type PrimaryValueProps = {
		value: React.ReactNode
		suffix?: React.ReactNode
		className?: string
	}

	type SelectOption<T extends string> = {
		value: T
		label: React.ReactNode
	}

	type SelectActionProps<T extends string> = {
		value: T
		options: ReadonlyArray<SelectOption<T>>
		onChange: (next: T) => void
		ariaLabel?: string
	}

	type Props = {
		children?: React.ReactNode
		title?: React.ReactNode
		titleAside?: React.ReactNode
		action?: React.ReactNode
		className?: string
		contentClassName?: string
		span?: Span
		rowSpan?: RowSpanProp
		status?: Status
		empty?: EmptyProps
	}
}
