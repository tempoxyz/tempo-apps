import { Button, style } from '@tempoxyz/ds/platform'
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
		<div {...styles.placeholder()}>
			<p role={failed ? 'alert' : 'status'}>
				{failed ? 'Unable to load source viewer.' : 'Loading source viewer…'}
			</p>
			{failed && (
				<Button
					onClick={() => window.location.reload()}
					scale="small"
					variant="secondary"
				>
					Reload
				</Button>
			)}
		</div>
	)
}

namespace styles {
	export const placeholder = style({
		alignItems: 'center',
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderWidth: 'regular',
		color: 'content.tertiary',
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		height: 'calc(min(620px, 70svh) + 96px) !custom',
		justifyContent: 'center',
		minHeight: '416px !custom',
		typography: 'body.b2',
	})
}
