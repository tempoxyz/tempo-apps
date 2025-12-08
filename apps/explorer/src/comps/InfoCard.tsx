import type { ReactNode } from 'react'
import { cx } from '#cva.config.ts'

export function InfoCard(props: InfoCard.Props) {
	const { title, sections, titlePosition = 'outside', className } = props

	const isInside = titlePosition === 'inside'

	const sectionsContent = sections.map((section, index) => {
		const isSectionEntry =
			section && typeof section === 'object' && 'label' in section
		const isLast = index === sections.length - 1
		const key = `section-${index}`

		return (
			<div
				key={key}
				className={cx(
					'px-[18px] py-[12px] flex items-center',
					!isInside && !isLast && 'border-b border-dashed border-card-border',
				)}
			>
				{isSectionEntry ? (
					<div className="flex items-center gap-[8px] justify-between w-full">
						<span className="text-[13px] font-normal capitalize text-tertiary">
							{section.label}
						</span>
						{section.value}
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
				'font-mono',
				'w-full min-[1240px]:w-fit',
				'rounded-[10px] border border-card-border bg-card-header overflow-hidden',
				isInside
					? 'divide-y divide-dashed divide-card-border shadow-[0px_12px_40px_rgba(0,0,0,0.06)]'
					: 'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				className,
			)}
		>
			{isInside ? (
				<div className="px-[18px] pt-[14px] pb-[12px]">{title}</div>
			) : (
				title
			)}
			{isInside ? (
				sectionsContent
			) : (
				<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-px -mx-px">
					{sectionsContent}
				</div>
			)}
		</section>
	)
}

export declare namespace InfoCard {
	export type Props = {
		title: ReactNode
		sections: Array<ReactNode | { label: string; value: ReactNode }>
		titlePosition?: 'inside' | 'outside'
		className?: string
	}
}
