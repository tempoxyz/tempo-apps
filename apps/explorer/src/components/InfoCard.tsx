import type { ReactNode } from 'react'
import { cx } from '#cva.config.ts'

export function InfoCard(props: InfoCard.Props) {
	const { title, secondary, sections, className } = props
	return (
		<section
			className={cx(
				'font-mono',
				'w-full min-[1240px]:w-fit',
				'rounded-[10px] border border-card-border bg-card-header overflow-hidden',
				'shadow-[0px_4px_44px_rgba(0,0,0,0.05)]',
				className,
			)}
		>
			<div className="flex items-center justify-between px-[18px] pt-[10px] pb-[8px]">
				<h1 className="text-[13px] uppercase text-tertiary select-none">
					{title}
				</h1>
				{secondary && <h2 className="text-[13px]">{secondary}</h2>}
			</div>
			<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-[1px] -mx-[1px]">
				{sections.map((section, index) => {
					const isSectionEntry =
						section && typeof section === 'object' && 'label' in section
					const isLast = index === sections.length - 1
					const key = `section-${index}`
					return (
						<div
							key={key}
							className={cx(
								'px-[18px] py-[12px] flex items-center',
								!isLast && 'border-b border-dashed border-card-border',
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
				})}
			</div>
		</section>
	)
}

export declare namespace InfoCard {
	export type Props = {
		title: string
		secondary?: ReactNode
		sections: Array<ReactNode | { label: string; value: ReactNode }>
		className?: string
	}
}
