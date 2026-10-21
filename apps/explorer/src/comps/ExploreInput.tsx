import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import {
	Autocomplete,
	Button,
	Combobox,
	Hex,
	Spinner,
	style,
	Tag,
	Token,
	variants,
} from '@tempoxyz/ds'
import { Search } from '@tempoxyz/ds/icons'
import * as Address from 'ox/Address'
import * as OxHex from 'ox/Hex'
import * as React from 'react'
import { RelativeTime } from '#comps/RelativeTime'
import { isTip20Address } from '#lib/domain/tip20'
import { getApiUrl } from '#lib/env.ts'
import { normalizeSearchInput } from '#lib/tempo-address'
import type {
	AddressSearchResult,
	BlockSearchResult,
	SearchApiResponse,
	SearchResult,
	TokenSearchResult,
} from '#routes/api/search'

const recentSearchesStorageKey = 'tempo-explorer-recent-searches'
const recentSearchesLimit = 6

function parseBlockInput(raw: string): number | null {
	const trimmed = raw.trim()
	const withoutHash = trimmed.startsWith('#')
		? trimmed.slice(1).trim()
		: trimmed
	if (!/^\d+$/.test(withoutHash)) return null
	const n = Number(withoutHash)
	if (!Number.isSafeInteger(n) || n < 0) return null
	return n
}

/** Resolves typed text to a block, address or transaction hash, if it is one. */
function parseSearchInput(raw: string): SearchResult | null {
	const input = normalizeSearchInput(raw.trim())
	if (!input) return null

	const blockNumber = parseBlockInput(input)
	if (blockNumber !== null) return { type: 'block', blockNumber }

	if (Address.validate(input))
		return { type: 'address', address: input, isTip20: isTip20Address(input) }

	if (OxHex.validate(input) && OxHex.size(input) === 32)
		return { type: 'transaction', hash: input }

	return null
}

function getSearchResultKey(result: SearchResult): string {
	if (result.type === 'block') return `block-${result.blockNumber}`
	if (result.type === 'transaction') return `tx-${result.hash.toLowerCase()}`
	return `${result.type}-${result.address.toLowerCase()}`
}

/** The text a suggestion puts in the input when chosen. */
function getSearchResultValue(result: SearchResult): string {
	if (result.type === 'block') return String(result.blockNumber)
	if (result.type === 'transaction') return result.hash
	return result.address
}

function toActivation(result: SearchResult): ExploreInput.Activation {
	if (result.type === 'block')
		return { type: 'block', value: String(result.blockNumber) }
	if (result.type === 'transaction') return { type: 'hash', value: result.hash }
	if (result.type === 'token') return { type: 'token', value: result.address }
	return { type: 'address', value: result.address }
}

function isPersistedSearchResult(value: unknown): value is SearchResult {
	if (typeof value !== 'object' || value == null) return false

	const result = value as Record<string, unknown>
	if (
		result.type === 'block' &&
		typeof result.blockNumber === 'number' &&
		Number.isSafeInteger(result.blockNumber) &&
		result.blockNumber >= 0
	)
		return true

	if (
		result.type === 'transaction' &&
		typeof result.hash === 'string' &&
		OxHex.validate(result.hash) &&
		OxHex.size(result.hash) === 32 &&
		(result.timestamp === undefined || typeof result.timestamp === 'number')
	)
		return true

	const validCategory =
		result.category === undefined ||
		result.category === 'token' ||
		result.category === 'system' ||
		result.category === 'utility' ||
		result.category === 'account' ||
		result.category === 'precompile'
	const validAddressMetadata =
		(result.label === undefined || typeof result.label === 'string') &&
		(result.description === undefined ||
			typeof result.description === 'string') &&
		validCategory

	if (
		result.type === 'address' &&
		typeof result.address === 'string' &&
		Address.validate(result.address) &&
		typeof result.isTip20 === 'boolean' &&
		validAddressMetadata
	)
		return true

	if (
		result.type === 'token' &&
		typeof result.address === 'string' &&
		Address.validate(result.address) &&
		typeof result.name === 'string' &&
		typeof result.symbol === 'string' &&
		typeof result.isTip20 === 'boolean'
	)
		return true

	return false
}

function loadRecentSearches(): SearchResult[] {
	if (typeof window === 'undefined') return []

	try {
		const rawValue = window.localStorage.getItem(recentSearchesStorageKey)
		if (!rawValue) return []
		const parsedValue = JSON.parse(rawValue)
		if (!Array.isArray(parsedValue)) return []
		return parsedValue
			.filter(isPersistedSearchResult)
			.slice(0, recentSearchesLimit)
	} catch {
		return []
	}
}

function persistRecentSearches(results: SearchResult[]): void {
	if (typeof window === 'undefined') return

	try {
		if (results.length === 0) {
			window.localStorage.removeItem(recentSearchesStorageKey)
			return
		}

		window.localStorage.setItem(
			recentSearchesStorageKey,
			JSON.stringify(results.slice(0, recentSearchesLimit)),
		)
	} catch {
		// Keep recent searches in memory when local storage is unavailable.
	}
}

/** Recent searches for an empty query, otherwise the results grouped by kind. */
function groupSuggestions(
	query: string,
	recentSearches: SearchResult[],
	results: SearchResult[],
): ExploreInput.SuggestionGroup[] {
	if (query === '')
		return recentSearches.length > 0
			? [{ type: 'recent', title: 'Recent searches', items: recentSearches }]
			: []

	const tokens: TokenSearchResult[] = []
	const addresses: AddressSearchResult[] = []
	const blocks: BlockSearchResult[] = []

	for (const result of results) {
		if (result.type === 'transaction')
			return [{ type: 'transaction', title: 'Transactions', items: [result] }]

		if (result.type === 'token') tokens.push(result)
		else if (result.type === 'address') addresses.push(result)
		else if (result.type === 'block') blocks.push(result)
	}

	const groups: ExploreInput.SuggestionGroup[] = []
	if (blocks.length > 0)
		groups.push({ type: 'block', title: 'Blocks', items: blocks })
	if (addresses.length > 0)
		groups.push({
			type: 'address',
			title: 'Contracts and addresses',
			items: addresses,
		})
	if (tokens.length > 0)
		groups.push({ type: 'token', title: 'Tokens', items: tokens })
	return groups
}

export function ExploreInput(props: ExploreInput.Props): React.JSX.Element {
	const {
		onActivate,
		value,
		onChange,
		size = 'medium',
		wide,
		autoFocus,
	} = props
	const inputRef = React.useRef<HTMLInputElement>(null)
	const [open, setOpen] = React.useState(false)
	const [recentSearches, setRecentSearches] = React.useState<SearchResult[]>([])

	const query = value.trim()
	const normalizedQuery = normalizeSearchInput(query)
	const { data, isFetching, isError } = useQuery(
		queryOptions({
			queryKey: ['search', normalizedQuery],
			queryFn: async ({ signal }): Promise<SearchApiResponse> => {
				const url = getApiUrl(
					'/api/search',
					new URLSearchParams({ q: normalizedQuery }),
				)
				const res = await fetch(url, { signal })
				if (!res.ok) throw new Error('Search failed')
				return res.json()
			},
			enabled: normalizedQuery !== '',
			staleTime: 30_000,
			placeholderData: keepPreviousData,
		}),
	)
	const results = data?.results

	const groups = React.useMemo(
		() => groupSuggestions(query, recentSearches, results ?? []),
		[query, recentSearches, results],
	)

	React.useEffect(() => {
		setRecentSearches(loadRecentSearches())
	}, [])

	React.useEffect(() => {
		if (
			autoFocus &&
			matchMedia('(min-width: 640px) and (hover: hover) and (pointer: fine)')
				.matches
		)
			inputRef.current?.focus({ preventScroll: true })
	}, [autoFocus])

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault()
				inputRef.current?.focus()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	const activate = (result: SearchResult) => {
		setRecentSearches((current) => {
			const key = getSearchResultKey(result)
			const next = [
				result,
				...current.filter((item) => getSearchResultKey(item) !== key),
			].slice(0, recentSearchesLimit)
			persistRecentSearches(next)
			return next
		})
		setOpen(false)
		onActivate?.(toActivation(result))
	}

	const clearRecentSearches = () => {
		persistRecentSearches([])
		setRecentSearches([])
		inputRef.current?.focus()
	}

	return (
		<div {...styles.root({ wide: Boolean(wide) })}>
			<Autocomplete.Root<SearchResult>
				autoHighlight="always"
				filteredItems={groups}
				itemToStringValue={getSearchResultValue}
				onOpenChange={setOpen}
				onValueChange={onChange}
				open={open && (query !== '' || recentSearches.length > 0)}
				openOnInputClick
				value={value}
			>
				<Autocomplete.InputGroup size={size}>
					<Combobox.Prefix>
						<Search />
					</Combobox.Prefix>
					<Autocomplete.Input
						ref={inputRef}
						aria-keyshortcuts="Meta+K Control+K"
						aria-label="Search by address, transaction hash, block, or token"
						data-1p-ignore
						enterKeyHint="search"
						onFocus={() => setOpen(true)}
						onKeyDown={(event) => {
							// Enter on a highlighted suggestion chooses it. Otherwise it
							// opens the typed address, hash or block number.
							if (
								event.key !== 'Enter' ||
								event.nativeEvent.isComposing ||
								event.currentTarget.hasAttribute('aria-activedescendant')
							)
								return
							const result = parseSearchInput(value)
							if (result) activate(result)
						}}
						placeholder="Search address, hash, block, token"
					/>
					<Autocomplete.Clear aria-label="Clear search" />
				</Autocomplete.InputGroup>
				<Autocomplete.Popup {...styles.popup()}>
					<Autocomplete.Empty>
						{isFetching ? (
							<Spinner aria-label="Searching" />
						) : isError ? (
							"Couldn't load suggestions. Enter a full address, hash, or block number."
						) : (
							'No results. Enter a full address, hash, or block number.'
						)}
					</Autocomplete.Empty>
					<Autocomplete.List>
						{(group: ExploreInput.SuggestionGroup) => (
							<Autocomplete.Group items={group.items} key={group.type}>
								<div {...styles.groupHeader()}>
									<Autocomplete.GroupLabel>
										{group.title}
									</Autocomplete.GroupLabel>
									{group.type === 'recent' && (
										<Button
											onClick={clearRecentSearches}
											size="small"
											variant="text"
										>
											Clear
										</Button>
									)}
								</div>
								<Autocomplete.Collection>
									{(result: SearchResult) => (
										<Suggestion
											key={getSearchResultKey(result)}
											onSelect={activate}
											suggestion={result}
										/>
									)}
								</Autocomplete.Collection>
							</Autocomplete.Group>
						)}
					</Autocomplete.List>
				</Autocomplete.Popup>
			</Autocomplete.Root>
		</div>
	)
}

export namespace ExploreInput {
	export type Activation =
		| { value: Address.Address; type: 'address' }
		| { value: Address.Address; type: 'token' }
		| { value: OxHex.Hex; type: 'hash' }
		| { value: string; type: 'block' }

	export interface Props {
		onActivate?: (data: Activation) => void
		value: string
		onChange: (value: string) => void
		/** TDS field height: `large` (56px) on the home page, `medium` (40px) in the header. */
		size?: 'large' | 'medium'
		wide?: boolean
		autoFocus?: boolean
	}

	export type SuggestionGroup = {
		type: 'recent' | 'token' | 'address' | 'transaction' | 'block'
		title: string
		items: SearchResult[]
	}
}

function Suggestion(props: {
	suggestion: SearchResult
	onSelect: (suggestion: SearchResult) => void
}): React.JSX.Element {
	const { suggestion, onSelect } = props

	return (
		<Autocomplete.Item onClick={() => onSelect(suggestion)} value={suggestion}>
			{suggestion.type === 'block' && (
				<Combobox.ItemText>{suggestion.blockNumber}</Combobox.ItemText>
			)}
			{suggestion.type === 'transaction' && (
				<>
					<Combobox.ItemText>
						<Hex value={suggestion.hash} />
					</Combobox.ItemText>
					{suggestion.timestamp !== undefined && (
						<Combobox.ItemSuffix>
							<RelativeTime timestamp={BigInt(suggestion.timestamp)} />
						</Combobox.ItemSuffix>
					)}
				</>
			)}
			{suggestion.type === 'token' && (
				<>
					<Combobox.ItemPrefix>
						<Token address={suggestion.address} />
					</Combobox.ItemPrefix>
					<LabelledAddress
						address={suggestion.address}
						label={suggestion.name}
					/>
					<Tag size="small">TIP-20</Tag>
				</>
			)}
			{suggestion.type === 'address' && (
				<>
					<LabelledAddress
						address={suggestion.address}
						label={suggestion.label}
					/>
					{suggestion.category ? (
						<Tag size="small">
							{suggestion.category.charAt(0).toUpperCase() +
								suggestion.category.slice(1)}
						</Tag>
					) : suggestion.isTip20 ? (
						<Tag size="small">TIP-20</Tag>
					) : null}
					{suggestion.description && (
						<Combobox.ItemSuffix {...styles.description()}>
							{suggestion.description}
						</Combobox.ItemSuffix>
					)}
				</>
			)}
		</Autocomplete.Item>
	)
}

/** A name over its address in gray, or the address alone when there is no name. */
function LabelledAddress(props: {
	address: Address.Address
	label?: string | undefined
}): React.JSX.Element {
	const { address, label } = props
	if (!label)
		return (
			<Combobox.ItemText>
				<Hex value={address} />
			</Combobox.ItemText>
		)

	return (
		<span {...styles.labelled()}>
			<Combobox.ItemText>{label}</Combobox.ItemText>
			<Hex.Root value={address}>
				<span {...styles.address()}>
					<Hex.Text />
				</span>
			</Hex.Root>
		</span>
	)
}

namespace styles {
	export const root = variants({
		base: {
			width: '100% !custom',
		},
		defaultVariants: { wide: false },
		variants: { wide: { true: {}, false: { maxWidth: '448px !custom' } } },
	})

	// The suggestions match the field's width instead of growing with long values.
	export const popup = style({ width: 'var(--anchor-width) !custom' })

	export const groupHeader = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
	})

	// A grid keeps both lines at their content height and lets them truncate.
	export const labelled = style({
		display: 'grid',
		flex: 1,
		gridTemplateColumns: 'minmax(0, 1fr) !custom',
		minWidth: '0',
	})

	export const address = style({
		color: 'gray.900',
		display: 'inline-flex',
		maxWidth: '100% !custom',
		minWidth: '0',
	})

	export const description = style({
		display: 'none',
		textAlign: 'end',
		width: '40% !custom',
		'@media (width >= 640px)': { display: 'block' },
	})
}
