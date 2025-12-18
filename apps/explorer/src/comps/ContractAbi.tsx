import type { Abi } from 'viem'
import CopyIcon from '~icons/lucide/copy'

// ============================================================================
// ABI Viewer
// ============================================================================

export function AbiViewer(props: {
	abi: Abi
	onCopy: () => void
	copied: boolean
}) {
	const { abi, onCopy, copied } = props

	return (
		<div className="relative py-4 px-4">
			<div className="absolute right-[8px] top-[8px] flex items-center gap-[4px]">
				{copied && (
					<span className="text-[11px] uppercase tracking-wide text-tertiary leading-none">
						copied
					</span>
				)}
				<button
					type="button"
					onClick={onCopy}
					title={copied ? 'Copied' : 'Copy JSON'}
					className="rounded-[6px] bg-card p-[6px] text-tertiary press-down hover:text-primary transition-colors"
				>
					<CopyIcon className="h-[14px] w-[14px]" />
				</button>
			</div>
			<pre className="max-h-[280px] overflow-auto rounded-[8px] text-[14px] tracking-wider leading-[20px] text-primary/90 font-mono outline-focus focus-visible:outline-2">
				{JSON.stringify(abi, null, 2)}
			</pre>
		</div>
	)
}
