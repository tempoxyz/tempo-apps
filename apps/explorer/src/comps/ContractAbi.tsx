import type { Abi } from 'viem'

// ============================================================================
// ABI Viewer
// ============================================================================

export function AbiViewer(props: { abi: Abi }) {
	const { abi } = props

	return (
		<div className="max-h-[280px] overflow-auto px-[18px] py-[12px]">
			<pre className="text-[12px] leading-[18px] text-primary font-mono">
				{JSON.stringify(abi, null, 2)}
			</pre>
		</div>
	)
}
