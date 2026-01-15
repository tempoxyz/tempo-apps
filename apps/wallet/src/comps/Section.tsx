import * as React from 'react'
import { waapi, spring } from 'animejs'
import { cx } from '#lib/css'
import ArrowLeftIcon from '~icons/lucide/arrow-left'
import PlusIcon from '~icons/lucide/plus'
import MinusIcon from '~icons/lucide/minus'
import GlobeIcon from '~icons/lucide/globe'

const springFast = spring({
	mass: 1,
	stiffness: 2600,
	damping: 100,
})

const springSlower = spring({
	mass: 1,
	stiffness: 1200,
	damping: 80,
})

export function Section(props: {
	title: string
	subtitle?: string
	titleRight?: React.ReactNode
	externalLink?: string
	defaultOpen?: boolean
	headerRight?: React.ReactNode
	children: React.ReactNode
	backButton?: {
		label: string
		onClick: () => void
		extra?: React.ReactNode
	}
}) {
	const {
		title,
		subtitle,
		titleRight,
		externalLink,
		defaultOpen = false,
		headerRight,
		children,
		backButton,
	} = props
	const [open, setOpen] = React.useState(defaultOpen)
	const contentRef = React.useRef<HTMLDivElement>(null)
	const wrapperRef = React.useRef<HTMLDivElement>(null)
	const innerRef = React.useRef<HTMLDivElement>(null)
	const animationRef = React.useRef<ReturnType<typeof waapi.animate> | null>(
		null,
	)

	const handleClick = () => {
		const content = contentRef.current
		const wrapper = wrapperRef.current
		const inner = innerRef.current
		if (!content || !wrapper || !inner) return

		// Cancel any running animation
		if (animationRef.current) {
			animationRef.current.cancel()
			animationRef.current = null
		}

		const nextOpen = !open
		setOpen(nextOpen)

		if (nextOpen) {
			const targetHeight = wrapper.getBoundingClientRect().height
			content.style.height = '0px'
			animationRef.current = waapi.animate(content, {
				height: [0, targetHeight],
				ease: springFast,
			})
			waapi.animate(inner, {
				translateY: ['-40%', '0%'],
				opacity: [0, 1],
				ease: springSlower,
			})
			animationRef.current.then(() => {
				requestAnimationFrame(() => {
					content.style.height = 'auto'
				})
				animationRef.current = null
			})
		} else {
			const currentHeight = content.offsetHeight
			content.style.height = `${currentHeight}px`
			animationRef.current = waapi.animate(content, {
				height: [currentHeight, 0],
				ease: springFast,
			})
			waapi.animate(inner, {
				scale: [1, 1],
				opacity: [1, 0],
				ease: springFast,
			})
			animationRef.current.then(() => {
				animationRef.current = null
			})
		}
	}

	return (
		<div className="rounded-xl border border-card-border bg-card-header">
			<div className="flex items-center h-[44px] pl-2 pr-2.5">
				<button
					type="button"
					onClick={handleClick}
					aria-expanded={open}
					className={cx(
						'flex flex-1 min-w-0 items-center justify-between cursor-pointer select-none press-down transition-colors',
						'text-[15px] font-medium text-primary hover:text-accent',
						'rounded-xl! focus-visible:outline-2! focus-visible:outline-accent! focus-visible:outline-offset-0!',
					)}
				>
					<span className="flex items-center gap-2 min-w-0 overflow-hidden">
						{backButton ? (
							<>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation()
										backButton.onClick()
									}}
									className="flex items-center gap-1.5 text-accent hover:text-accent/80 transition-colors cursor-pointer shrink-0"
								>
									<ArrowLeftIcon className="size-[14px] shrink-0" />
									<span className="truncate max-w-[100px] sm:max-w-[150px]">
										{backButton.label}
									</span>
								</button>
								<span className="hidden sm:flex items-center gap-1.5 shrink-0">
									{backButton.extra}
								</span>
							</>
						) : (
							<>
								<span className="shrink-0">{title}</span>
								{subtitle && (
									<>
										<span className="w-px h-4 bg-card-border shrink-0" />
										<span className="text-[12px] text-tertiary font-normal truncate">
											{subtitle}
										</span>
									</>
								)}
								{titleRight && (
									<>
										<span className="w-px h-4 bg-card-border shrink-0" />
										{titleRight}
									</>
								)}
							</>
						)}
					</span>
				</button>
				<span className="flex items-center gap-1.5">
					{headerRight}
					{externalLink && (
						<a
							href={externalLink}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center justify-center size-[24px] rounded-md bg-base-alt hover:bg-base-alt/70 transition-colors focus-ring"
							onClick={(e) => e.stopPropagation()}
							aria-label="View on external site"
						>
							<GlobeIcon className="size-[14px] text-tertiary" />
						</a>
					)}
					<button
						type="button"
						onClick={handleClick}
						aria-expanded={open}
						aria-label={open ? 'Collapse section' : 'Expand section'}
						className="flex items-center justify-center size-[24px] rounded-md bg-base-alt hover:bg-base-alt/70 transition-colors cursor-pointer focus-ring"
					>
						{open ? (
							<MinusIcon className="size-[14px] text-tertiary" />
						) : (
							<PlusIcon className="size-[14px] text-tertiary" />
						)}
					</button>
				</span>
			</div>
			<div
				ref={contentRef}
				className="overflow-hidden rounded-b-xl"
				style={{ height: open ? 'auto' : 0 }}
				inert={!open ? true : undefined}
			>
				<div
					ref={wrapperRef}
					className="bg-card border-t border-card-border px-2 rounded-b-xl overflow-hidden"
				>
					<div ref={innerRef} className="origin-top">
						{children}
					</div>
				</div>
			</div>
		</div>
	)
}
