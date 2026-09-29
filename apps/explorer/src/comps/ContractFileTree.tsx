import { FileTree, useFileTree, useFileTreeSearch } from '@pierre/trees/react'
import * as React from 'react'
import SearchIcon from '~icons/lucide/search'

export function ContractFileTree(
	props: ContractFileTree.Props,
): React.JSX.Element {
	const { paths, selectedPath, onSelect } = props
	const syncing = React.useRef(false)
	const { model } = useFileTree({
		paths,
		initialExpansion: 1,
		flattenEmptyDirectories: true,
		fileTreeSearchMode: 'hide-non-matches',
		onSelectionChange: (selected) => {
			if (syncing.current) return
			const path = selected.at(-1)
			if (path && paths.includes(path)) onSelect(path)
		},
		unsafeCSS: `:host {
			color-scheme: inherit;
			--trees-font-family-override: inherit;
			--trees-font-size-override: 12px;
			--trees-bg-override: var(--color-card-header);
			--trees-fg-override: var(--color-primary);
			--trees-fg-muted-override: var(--color-tertiary);
			--trees-bg-muted-override: var(--color-base-alt);
			--trees-accent-override: var(--color-accent);
			--trees-border-color-override: var(--color-card-border);
		}`,
	})
	const search = useFileTreeSearch(model)

	React.useEffect(() => {
		syncing.current = true
		try {
			for (const path of model.getSelectedPaths())
				model.getItem(path)?.deselect()
			model.getItem(selectedPath)?.select()
			const segments = selectedPath.split('/')
			for (let index = 1; index < segments.length; index++) {
				const item = model.getItem(segments.slice(0, index).join('/'))
				if (item && 'expand' in item) item.expand()
			}
			model.scrollToPath(selectedPath, { focus: false })
		} finally {
			syncing.current = false
		}
	}, [model, selectedPath])

	return (
		<nav
			aria-label="Source files"
			className="shrink-0 border-b border-card-border bg-card-header md:w-[260px] md:border-r md:border-b-0"
		>
			<label className="m-3 flex items-center gap-2 rounded border border-card-border bg-base-background px-2 py-2 text-tertiary">
				<SearchIcon className="size-3.5 shrink-0" />
				<input
					aria-label="Filter source files"
					placeholder="Find a file…"
					value={search.value}
					onChange={(event) => search.setValue(event.target.value || null)}
					className="min-w-0 w-full bg-transparent text-xs outline-none"
				/>
			</label>
			{search.value && search.matchingPaths.length === 0 && (
				<p className="px-3 text-xs text-tertiary" role="status">
					No files found.
				</p>
			)}
			<FileTree
				model={model}
				aria-label="Contract source files"
				className="block h-[160px] overflow-auto px-2 pb-3 md:h-[548px]"
			/>
		</nav>
	)
}

export declare namespace ContractFileTree {
	type Props = {
		paths: string[]
		selectedPath: string
		onSelect: (path: string) => void
	}
}
