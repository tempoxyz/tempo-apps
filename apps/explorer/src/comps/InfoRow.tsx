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
				'flex items-start gap-[16px] px-[18px] py-[12px] border-b border-solid border-card-border last:border-b-0',
				stackOnMobile && 'max-[600px]:flex-col max-[600px]:gap-[8px]',
			)}
		>
			<span className="copy-14 text-tertiary min-w-[100px] sm:min-w-[140px] shrink-0 font-sans">
				{label}
			</span>
			<div className="copy-14 break-all w-full min-w-0 font-sans">
				{children}
			</div>
		</div>
	)
}
