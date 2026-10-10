import { FileTree, useFileTree, useFileTreeSearch } from '@pierre/trees/react'
import { style, vars } from '@tempoxyz/ds/platform'
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
			--trees-font-family-override: var(--contract-tree-font);
			--trees-font-size-override: 12px;
			--trees-bg-override: var(--contract-tree-background);
			--trees-fg-override: var(--contract-tree-foreground);
			--trees-fg-muted-override: var(--contract-tree-muted);
			--trees-bg-muted-override: var(--contract-tree-muted-background);
			--trees-accent-override: var(--contract-tree-accent);
			--trees-selected-bg-override: var(--contract-tree-selected-background);
			--trees-selected-fg-override: var(--contract-tree-foreground);
			--trees-focus-ring-color-override: var(--contract-tree-accent);
			--trees-selected-focused-border-color-override: var(--contract-tree-accent);
			--trees-focus-ring-width-override: 2px;
			--trees-border-color-override: var(--contract-tree-border);
			--trees-border-radius-override: 8px;
			--trees-padding-inline-override: 8px;
			--trees-item-padding-x-override: 4px;
			--trees-item-row-gap-override: 4px;
			letter-spacing: 0.15px;
		}
		[data-type="item"]:active:not([data-item-selected="true"]) {
			background: var(--contract-tree-pressed-background);
		}
		[data-item-selected="true"] {
			box-shadow: inset 0 0 0 1px var(--contract-tree-accent);
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
		<nav aria-label="Source files" {...styles.nav()}>
			<div {...styles.search()}>
				<label {...styles.searchField()}>
					<SearchIcon {...styles.searchIcon()} />
					<input
						aria-label="Filter source files"
						placeholder="Find a file…"
						value={search.value}
						onChange={(event) => search.setValue(event.target.value || null)}
						{...styles.searchInput()}
					/>
				</label>
			</div>
			{search.value && search.matchingPaths.length === 0 && (
				<p {...styles.empty()} role="status">
					No files found.
				</p>
			)}
			<FileTree
				model={model}
				aria-label="Contract source files"
				{...styles.tree()}
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

namespace styles {
	export const nav = style({
		// Read by the tree's shadow DOM through `unsafeCSS`.
		'--contract-tree-accent': vars.color.border.focus,
		'--contract-tree-background': vars.color.background.secondary,
		'--contract-tree-border': vars.color.line.secondary,
		'--contract-tree-font': 'Pilat, Arial, sans-serif',
		'--contract-tree-foreground': vars.color.content.primary,
		'--contract-tree-muted': vars.color.content.tertiary,
		'--contract-tree-muted-background': vars.color.container.subtle,
		'--contract-tree-pressed-background': vars.color.container.strong,
		'--contract-tree-selected-background': vars.color.container.regular,
		backgroundColor: 'background.secondary',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		flexShrink: 0,
		fontFamily: 'Pilat, Arial, sans-serif',
		minWidth: '0px !custom',
		'@container source (width >= 42rem)': {
			borderBottomWidth: 'none',
			borderRightWidth: 'regular',
			height: '100% !custom',
		},
	})

	export const search = style({ padding: '8' })

	// Mirrors TDS Search at toolbar height.
	export const searchField = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		color: 'content.tertiary',
		display: 'flex',
		gap: '8',
		height: '32',
		paddingInline: '12',
		':focus-within': {
			outlineColor: 'border.focus',
			outlineOffset: '-2px',
			outlineStyle: 'solid',
			outlineWidth: '2px',
		},
	})

	export const searchIcon = style({
		flexShrink: 0,
		height: '14px !custom',
		width: '14px !custom',
	})

	// The field shows the focus ring, so the input itself draws none.
	export const searchInput = style({
		backgroundColor: 'transparent !custom',
		color: 'content.primary',
		minWidth: '0px !custom',
		typography: 'body.b3',
		width: '100% !custom',
		'::placeholder': { color: 'content.tertiary' },
		':focus-visible': { outlineStyle: 'none' },
	})

	export const empty = style({
		color: 'content.tertiary',
		paddingInline: '12',
		typography: 'body.b3',
	})

	export const tree = style({
		display: 'block',
		height: '180px !custom',
		overflow: 'auto',
		paddingBottom: '8',
		'@container source (width >= 42rem)': {
			height: 'calc(min(620px, 70svh) - 32px) !custom',
			minHeight: '288px !custom',
		},
	})
}
