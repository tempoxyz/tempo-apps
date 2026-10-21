import * as React from 'react'
import { cx } from '#lib/css'
import ChevronDownIcon from '~icons/lucide/chevron-down'

export function ContractFeatureCard(props: {
	title: string
	rightSideTitle?: string
	actions?: React.ReactNode
	children: React.ReactNode
	description?: React.ReactNode
	rightSideDescription?: string
	textGrid?: Array<{ left?: React.ReactNode; right?: React.ReactNode }>
	collapsible?: boolean
	defaultCollapsed?: boolean
	docsUrl?: string
}) {
	const {
		title,
		description,
		actions,
		children,
		rightSideDescription,
		rightSideTitle,
		textGrid,
		collapsible,
		defaultCollapsed,
	} = props

	const [isCollapsed, setIsCollapsed] = React.useState(
		defaultCollapsed ?? false,
	)

	if (collapsible) {
		return (
			<section
				className={cx(
					'flex flex-col w-full overflow-hidden',
					'rounded-body border border-card-border bg-card-header',
					'shadow-none',
				)}
			>
				<div className="flex items-center min-h-9 shrink-0">
					<button
						type="button"
						onClick={() => setIsCollapsed(!isCollapsed)}
						className={cx(
							'min-w-0 flex-1 flex items-center gap-[6px] py-2 pl-[16px] text-left cursor-pointer press-down focus-visible:-outline-offset-2!',
							actions ? 'pr-[12px]' : 'pr-[16px]',
						)}
					>
						<span className="min-w-0 copy-13 text-tertiary [overflow-wrap:anywhere]">
							{title}
						</span>
						<ChevronDownIcon
							className={cx(
								'size-[14px] shrink-0 text-tertiary',
								isCollapsed && '-rotate-90',
							)}
						/>
					</button>
					{actions && (
						<div className="flex shrink-0 items-center gap-[8px] text-tertiary px-[12px]">
							{actions}
						</div>
					)}
				</div>

				<div
					className={cx(
						'rounded-t-body border-t border-card-border bg-card flex flex-col min-h-0 overflow-x-auto px-[10px] pt-[10px]',
						isCollapsed && 'hidden',
					)}
				>
					{children}
				</div>
			</section>
		)
	}

	return (
		<section className="rounded-body bg-card-header overflow-hidden">
			<div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between w-full">
				<div className="w-full min-w-0">
					<div className="flex items-center w-full gap-2 justify-between">
						<a
							id={title.toLowerCase().replaceAll(' ', '-')}
							href={`#${title.toLowerCase().replaceAll(' ', '-')}`}
							className="min-w-0 copy-14 text-primary/90 font-medium [overflow-wrap:anywhere]"
						>
							{title}
						</a>

						<p className="min-w-0 label-12 text-primary text-right font-medium [overflow-wrap:anywhere]">
							{rightSideTitle}
						</p>
					</div>
					<div className="flex items-center w-full gap-2 justify-between">
						{description && (
							<p className="label-12 text-secondary">{description}</p>
						)}
						{rightSideDescription && (
							<p className="label-12 text-secondary">{rightSideDescription}</p>
						)}
					</div>
					{textGrid && (
						<div className="flex flex-wrap gap-x-4 gap-y-1 justify-between mt-1">
							{textGrid.map((item, index) => (
								<div key={index} className="label-12 gap-2 flex">
									{item.left}
									{item.right}
								</div>
							))}
						</div>
					)}
				</div>
				{actions}
			</div>
			<div className="bg-card p-2">{children}</div>
		</section>
	)
}
