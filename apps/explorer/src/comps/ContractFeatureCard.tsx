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
					'rounded-[10px] border border-card-border bg-card-header',
					'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				)}
			>
				<div className="flex items-center h-9 shrink-0">
					<button
						type="button"
						onClick={() => setIsCollapsed(!isCollapsed)}
						className={cx(
							'flex-1 flex items-center gap-[6px] h-full pl-[16px] cursor-pointer press-down focus-visible:-outline-offset-2!',
							actions ? 'pr-[12px]' : 'pr-[16px]',
						)}
					>
						<span className="text-[13px] text-tertiary whitespace-nowrap">
							{title}
						</span>
						<ChevronDownIcon
							className={cx(
								'size-[14px] text-tertiary',
								isCollapsed && '-rotate-90',
							)}
						/>
					</button>
					{actions && (
						<div className="flex items-center gap-[8px] text-tertiary px-[12px]">
							{actions}
						</div>
					)}
				</div>

				<div
					className={cx(
						'rounded-t-[10px] border-t border-card-border bg-card flex flex-col min-h-0 overflow-x-auto px-[10px] pt-[10px]',
						isCollapsed && 'hidden',
					)}
				>
					{children}
				</div>
			</section>
		)
	}

	return (
		<section className="rounded-[10px] bg-card-header overflow-hidden">
			<div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between w-full">
				<div className="w-full">
					<div className="flex items-center w-full gap-2 justify-between">
						<a
							id={title.toLowerCase().replaceAll(' ', '-')}
							href={`#${title.toLowerCase().replaceAll(' ', '-')}`}
							className="text-[14px] text-primary/90 font-medium"
						>
							{title}
						</a>

						<p className="text-[12px] text-primary font-medium">
							{rightSideTitle}
						</p>
					</div>
					<div className="flex items-center w-full gap-2 justify-between">
						{description && (
							<p className="text-[12px] text-secondary">{description}</p>
						)}
						{rightSideDescription && (
							<p className="text-[12px] text-secondary">
								{rightSideDescription}
							</p>
						)}
					</div>
					{textGrid && (
						<div className="flex flex-row justify-between mt-1">
							{textGrid.map((item, index) => (
								<div key={index} className="text-xs gap-2 flex">
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
