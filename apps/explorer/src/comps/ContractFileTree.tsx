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
		initialExpansion: 'open',
		flattenEmptyDirectories: true,
		itemHeight: 28,
		fileTreeSearchMode: 'hide-non-matches',
		onSelectionChange: (selected) => {
			if (syncing.current) return
			const path = selected.at(-1)
			if (path && paths.includes(path)) onSelect(path)
		},
		unsafeCSS: `:host {
			color-scheme: inherit;
			--trees-font-family-override: var(--font-pilat);
			--trees-font-size-override: 13px;
			--trees-bg-override: var(--color-base-background);
			--trees-fg-override: var(--color-primary);
			--trees-fg-muted-override: var(--color-tertiary);
			--trees-bg-muted-override: var(--color-base-alt);
			--trees-accent-override: var(--color-accent);
			--trees-selected-bg-override: var(--color-base-background);
			--trees-selected-fg-override: var(--color-primary);
			--trees-focus-ring-color-override: var(--color-focus);
			--trees-selected-focused-border-color-override: var(--color-focus);
			--trees-focus-ring-width-override: 2px;
			--trees-border-color-override: var(--color-card-border);
			--trees-border-radius-override: 6px;
			--trees-padding-inline-override: 8px;
			--trees-item-padding-x-override: 4px;
			--trees-item-row-gap-override: 4px;
			letter-spacing: 0.01em;
		}
		[data-type="item"]:active:not([data-item-selected="true"]) {
			background: var(--color-distinct);
		}
		[data-item-selected="true"] {
			box-shadow: inset 0 0 0 1px var(--color-accent);
		}
		[data-item-selected="true"] [data-icon-token] {
			color: var(--trees-selected-fg);
		}
		[data-item-section="spacing"] { padding-left: 0; }
		[data-item-section="spacing-item"] {
			box-sizing: border-box;
			width: 12px;
			margin: 0;
			transform: none;
		}
		[data-item-section="spacing-item"] + [data-item-section="spacing-item"] {
			margin-left: 0;
		}
		/* Compact folders get one end ellipsis, not one per path segment. */
		[data-item-type="folder"] [data-item-section="content"] {
			display: none;
		}
		[data-item-type="folder"]::after {
			content: attr(aria-label);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
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
			className="min-w-0 shrink-0 border-b border-card-border bg-base-background font-pilat md:w-[280px] md:border-r md:border-b-0"
		>
			<div className="p-2">
				<label className="flex h-[40px] items-center gap-2 rounded-md bg-base-alt px-3 text-tertiary focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-[-2px]">
					<SearchIcon className="size-3.5 shrink-0" />
					<input
						aria-label="Filter source files"
						placeholder="Find a file…"
						value={search.value}
						onChange={(event) => search.setValue(event.target.value || null)}
						className="min-w-0 w-full bg-transparent text-[13px] tracking-[0.01em] text-primary placeholder:text-tertiary outline-none"
					/>
				</label>
			</div>
			{search.value && search.matchingPaths.length === 0 && (
				<p className="px-3 text-xs text-tertiary" role="status">
					No files found.
				</p>
			)}
			<FileTree
				model={model}
				aria-label="Contract source files"
				className="block h-[180px] overflow-auto pb-2 md:h-[564px]"
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
