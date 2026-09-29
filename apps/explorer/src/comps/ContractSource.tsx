import * as React from 'react'
import type {
	ContractSource,
	ContractSourceFile,
} from '#lib/domain/contract-source.ts'

function getSourceEntries(
	sources: Record<string, ContractSourceFile>,
	paths?: string[],
): Array<[string, ContractSourceFile]> {
	if (!paths) return Object.entries(sources)

	return Object.entries(sources).toSorted(([left], [right]) => {
		const leftIndex = paths.indexOf(left)
		const rightIndex = paths.indexOf(right)
		const safeLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
		const safeRightIndex =
			rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
		return safeLeftIndex - safeRightIndex || left.localeCompare(right)
	})
}

export function SourceSection(props: ContractSource & { docsUrl?: string }) {
	const sources =
		props.kind === 'verified' ? props.stdJsonInput.sources : props.sources
	const paths = props.kind === 'verified' ? undefined : props.nativeSource.paths
	// Selection URL changes must not recreate the viewer's source/highlight cache.
	const entries = React.useMemo(
		() => getSourceEntries(sources, paths),
		[sources, paths],
	)
	return (
		<section aria-label="Contract source code">
			<SourceBrowser
				key={`${props.chainId}:${props.address}`}
				entries={entries}
			/>
		</section>
	)
}

function SourceBrowser(props: {
	entries: Array<[string, ContractSourceFile]>
}): React.JSX.Element {
	const [Viewer, setViewer] =
		React.useState<typeof import('./ContractCodeView').ContractCodeView>()
	const [failed, setFailed] = React.useState(false)
	React.useEffect(() => {
		let mounted = true
		void import('./ContractCodeView')
			.then(({ ContractCodeView }) => {
				if (mounted) setViewer(() => ContractCodeView)
			})
			.catch(() => {
				if (mounted) setFailed(true)
			})
		return () => {
			mounted = false
		}
	}, [])
	if (Viewer) return <Viewer entries={props.entries} />
	return (
		<div className="flex h-[710px] flex-col items-center justify-center gap-3 rounded-md border border-card-border bg-source-background copy-14 text-tertiary">
			<p role={failed ? 'alert' : 'status'}>
				{failed ? 'Unable to load source viewer.' : 'Loading source viewer…'}
			</p>
			{failed && (
				<button
					type="button"
					onClick={() => window.location.reload()}
					className="cursor-pointer rounded-md border border-card-border px-3 py-2 text-primary hover:bg-base-alt focus-visible:outline-2 focus-visible:outline-focus"
				>
					Reload
				</button>
			)}
		</div>
	)
}
