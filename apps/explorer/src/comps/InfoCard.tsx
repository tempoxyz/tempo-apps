import type { ReactNode } from 'react'
import { cx } from '#lib/css'

export function InfoCard(props: InfoCard.Props) {
	const { title, sections, className } = props

	const hasTitle = typeof title !== 'undefined' && title !== null

	const sectionsContent = sections.map((section, index) => {
		const isSectionEntry =
			section && typeof section === 'object' && 'label' in section
		const isLast = index === sections.length - 1
		const key = `section-${index}`

		return (
			<div
				key={key}
				className={cx(
					'flex items-center px-4.5 py-3 type-card',
					!isLast && 'border-b border-solid border-card-border',
				)}
			>
				{isSectionEntry ? (
					<div className="flex items-center gap-2 justify-between w-full">
						<span className="capitalize text-tertiary shrink-0">
							{section.label}
						</span>
						<div className="min-w-0 flex-1 flex justify-end type-card-data text-primary">
							{section.value}
						</div>
					</div>
				) : (
					section
				)}
			</div>
		)
	})

	return (
		<section
			className={cx(
				'type-card',
				'w-full min-[1240px]:w-fit',
				'rounded-body border border-card-border bg-card-header overflow-hidden shadow-none',
				className,
			)}
		>
			{hasTitle && (
				<div className="flex items-center min-h-11 px-4 text-primary bg-card-header">
					{title}
				</div>
			)}
			{hasTitle ? (
				<div className="rounded-t-body border-t border-card-border bg-card -mx-px -mb-px">
					{sectionsContent}
				</div>
			) : (
				sectionsContent
			)}
		</section>
	)
}

InfoCard.Title = function InfoCardTitle(props: {
	children: ReactNode
	className?: string
}) {
	return (
		<h1
			className={cx(
				'heading-16 text-primary select-none flex items-center gap-2',
				props.className,
			)}
		>
			{props.children}
		</h1>
	)
}

export declare namespace InfoCard {
	export type Props = {
		sections: Array<ReactNode | { label: ReactNode; value: ReactNode }>
		title?: ReactNode
		className?: string
	}
}
