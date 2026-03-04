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
					'flex items-center px-4.5 py-3',
					!isLast && 'border-b border-dashed border-card-border',
				)}
			>
				{isSectionEntry ? (
					<div className="flex items-center gap-2 justify-between w-full">
						<span className="text-[13px] font-normal capitalize text-tertiary shrink-0 font-sans">
							{section.label}
						</span>
						<div className="min-w-0 flex-1 flex justify-end font-mono text-primary">
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
				'font-sans',
				'w-full min-[1240px]:w-fit',
				'rounded-[10px] border border-card-border bg-card overflow-hidden shadow-[0px_12px_40px_rgba(0,0,0,0.06)]',
				className,
			)}
		>
			{hasTitle && (
				<div className="flex items-center h-9 px-4 text-[13px] text-tertiary font-normal">
					{title}
				</div>
			)}
			{hasTitle ? (
				<div className="rounded-t-[10px] border-t border-card-border -mx-px -mb-px">
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
				'text-[13px] text-tertiary select-none flex items-center gap-2',
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
