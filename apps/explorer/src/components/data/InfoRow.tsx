export function InfoRow(props: { label: string; children: React.ReactNode }) {
	const { label, children } = props
	return (
		<div className="flex items-start gap-[16px] px-[18px] py-[12px] border-b border-dashed border-card-border last:border-b-0">
			<span className="text-[13px] text-tertiary min-w-[140px] shrink-0">
				{label}
			</span>
			<div className="text-[13px] break-all">{children}</div>
		</div>
	)
}
