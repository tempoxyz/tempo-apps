import { cx } from '#lib/css'

export function InfoRow(props: {
	label: string
	children: React.ReactNode
	stackOnMobile?: boolean
}) {
	const { label, children, stackOnMobile } = props
	return (
		<div
			className={cx(
				'flex items-start gap-[16px] px-[18px] py-[12px] border-b border-dashed border-card-border last:border-b-0',
				stackOnMobile && 'max-[600px]:flex-col max-[600px]:gap-[8px]',
			)}
		>
			<span className="text-[13px] text-tertiary min-w-[140px] shrink-0 font-sans">
				{label}
			</span>
			<div className="text-[13px] break-all w-full min-w-0 font-mono">
				{children}
			</div>
		</div>
	)
}
