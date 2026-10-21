import { Callout, Spinner, style } from '@tempoxyz/ds'
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
		<div aria-busy={!failed} {...styles.placeholder()}>
			{failed ? (
				<Callout intent="negative" size="small">
					<Callout.Icon />
					<Callout.Content>Couldn’t load the source viewer.</Callout.Content>
					<Callout.Action onClick={() => window.location.reload()}>
						Reload page
					</Callout.Action>
				</Callout>
			) : (
				<Spinner aria-label="Loading source viewer" />
			)}
		</div>
	)
}

namespace styles {
	// Holds the viewer's height, so the tab doesn't shift when it loads.
	export const placeholder = style({
		alignItems: 'center',
		borderColor: 'grayAlpha.200',
		borderRadius: '12',
		borderStyle: 'solid',
		borderWidth: '1px',
		display: 'flex',
		height: 'calc(min(620px, 70svh) + 96px) !custom',
		justifyContent: 'center',
		minHeight: '416px !custom',
		padding: '16',
	})
}
