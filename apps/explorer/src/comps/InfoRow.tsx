import { style } from '@tempoxyz/ds/platform'
import { cx } from 'zyzz'

export function InfoRow(props: {
	label: string
	children: React.ReactNode
	stackOnMobile?: boolean
}) {
	const { label, children, stackOnMobile } = props
	return (
		<div {...cx(styles.row(), stackOnMobile && styles.stackOnMobile())}>
			<span {...styles.label()}>{label}</span>
			<div {...styles.value()}>{children}</div>
		</div>
	)
}

namespace styles {
	export const row = style({
		alignItems: 'flex-start',
		borderBottomColor: 'line.secondary',
		borderBottomStyle: 'solid',
		borderBottomWidth: 'regular',
		display: 'flex',
		gap: '16',
		paddingBlock: '12',
		paddingInline: '20',
		':last-child': { borderBottomWidth: 'none' },
	})

	export const stackOnMobile = style({
		'@media (width < 600px)': { flexDirection: 'column', gap: '8' },
	})

	export const label = style({
		color: 'content.tertiary',
		flexShrink: '0 !custom',
		minWidth: '100px !custom',
		typography: 'body.b2',
		'@media (width >= 640px)': { minWidth: '140px !custom' },
	})

	export const value = style({
		minWidth: '0 !custom',
		typography: 'body.b2',
		width: '100% !custom',
		wordBreak: 'break-all',
	})
}
