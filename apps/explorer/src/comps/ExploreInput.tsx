import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { IconButton, style, variants, vars } from '@tempoxyz/ds/platform'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as React from 'react'
import { cx } from 'zyzz'
import { Midcut } from '#comps/Midcut'
import { useMountAnim } from '#lib/animation'
import { ProgressLine } from '#comps/ProgressLine'
import { RelativeTime } from '#comps/RelativeTime'
import { isTip20Address } from '#lib/domain/tip20'
import { getApiUrl } from '#lib/env.ts'
import { normalizeSearchInput } from '#lib/tempo-address'
import { link, pressDown, transitionColors, truncate } from '#styles/explorer'
import type {
	AddressSearchResult,
	BlockSearchResult,
	SearchApiResponse,
	SearchResult,
	TokenSearchResult,
} from '#routes/api/search'
import ArrowRight from '~icons/lucide/arrow-right'

const recentSearchesStorageKey = 'tempo-explorer-recent-searches'
const recentSearchesLimit = 6

type ManualActivation =
	| { value: Address.Address; type: 'address' }
	| { value: Hex.Hex; type: 'hash' }
	| { value: string; type: 'block' }

function parseBlockInput(raw: string): string | null {
	const trimmed = raw.trim()
	const withoutHash = trimmed.startsWith('#')
		? trimmed.slice(1).trim()
		: trimmed
	if (!/^\d+$/.test(withoutHash)) return null
	const n = Number(withoutHash)
	if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 0) return null
	return String(n)
}

function getSearchResultKey(result: SearchResult): string {
	if (result.type === 'block') return `block-${result.blockNumber}`
	if (result.type === 'transaction') return `tx-${result.hash.toLowerCase()}`
	return `${result.type}-${result.address.toLowerCase()}`
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
		Hex.validate(result.hash) &&
		Hex.size(result.hash) === 32 &&
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

function toManualSearchResult(data: ManualActivation): SearchResult {
	if (data.type === 'block')
		return { type: 'block', blockNumber: Number(data.value) }

	if (data.type === 'hash') return { type: 'transaction', hash: data.value }

	return {
		type: 'address',
		address: data.value,
		isTip20: isTip20Address(data.value),
	}
}

export function ExploreInput(props: ExploreInput.Props) {
	const {
		onActivate,
		inputRef: externalInputRef,
		wrapperRef: externalWrapperRef,
		value,
		onChange,
		size = 'medium',
		className,
		wide,
		tabIndex,
		autoFocus,
	} = props
	const formRef = React.useRef<HTMLFormElement>(null)
	const rootRef = React.useRef<HTMLDivElement>(null)
	const resultsRef = React.useRef<HTMLDivElement>(null)

	const internalInputRef = React.useRef<HTMLInputElement>(null)
	const inputRef = externalInputRef ?? internalInputRef

	const [showResults, setShowResults] = React.useState(false)
	const [selectedIndex, setSelectedIndex] = React.useState(-1)
	const [recentSearches, setRecentSearches] = React.useState<SearchResult[]>([])
	const [hasFocus, setHasFocus] = React.useState(false)
	const menuMounted = useMountAnim(showResults, resultsRef)
	const resultsId = React.useId()

	// prevents the menu from reopening when
	// activating a menu item fills the input
	const submittingRef = React.useRef(false)

	const query = value.trim()
	const normalizedQuery = normalizeSearchInput(query)
	const isValidInput =
		query.length > 0 &&
		(Address.validate(normalizedQuery) ||
			(Hex.validate(normalizedQuery) && Hex.size(normalizedQuery) === 32) ||
			parseBlockInput(normalizedQuery) !== null)
	const {
		data: searchResults,
		isFetching,
		isError,
	} = useQuery(
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
	const suggestions = searchResults?.results ?? []

	const groupedSuggestions = React.useMemo<
		ExploreInput.SuggestionGroup[]
	>(() => {
		if (query.length === 0 && recentSearches.length > 0)
			return [
				{
					type: 'recent',
					title: 'Recent searches',
					items: recentSearches,
				},
			]

		const tokens: TokenSearchResult[] = []
		const addresses: AddressSearchResult[] = []
		const blocks: BlockSearchResult[] = []

		for (const suggestion of suggestions) {
			if (suggestion.type === 'transaction')
				return [
					{ type: 'transaction', title: 'Transactions', items: [suggestion] },
				]

			if (suggestion.type === 'token') tokens.push(suggestion)
			else if (suggestion.type === 'address') addresses.push(suggestion)
			else if (suggestion.type === 'block') blocks.push(suggestion)
		}

		const groups: ExploreInput.SuggestionGroup[] = []

		if (blocks.length > 0)
			groups.push({ type: 'block', title: 'Blocks', items: blocks })

		if (addresses.length > 0)
			groups.push({
				type: 'address',
				title: 'Contracts & addresses',
				items: addresses,
			})

		if (tokens.length > 0)
			groups.push({ type: 'token', title: 'Tokens', items: tokens })

		return groups
	}, [query.length, recentSearches, suggestions])

	const flatSuggestions = React.useMemo(
		() => groupedSuggestions.flatMap((g) => g.items),
		[groupedSuggestions],
	)

	const closeResults = React.useCallback(() => {
		setHasFocus(false)
		setShowResults(false)
		setSelectedIndex(-1)
	}, [])

	React.useEffect(() => {
		setRecentSearches(loadRecentSearches())
	}, [])

	React.useEffect(() => {
		if (
			autoFocus &&
			matchMedia('(min-width: 640px) and (hover: hover) and (pointer: fine)')
				.matches
		) {
			inputRef.current?.focus({ preventScroll: true })
		}
	}, [autoFocus, inputRef])

	React.useEffect(() => {
		if (inputRef.current === document.activeElement) setHasFocus(true)
	}, [inputRef])

	React.useEffect(() => {
		if (submittingRef.current) {
			submittingRef.current = false
			return
		}
		setShowResults(hasFocus && (query.length > 0 || recentSearches.length > 0))
	}, [hasFocus, query.length, recentSearches.length])

	const previousResultsKeyRef = React.useRef('')
	React.useEffect(() => {
		const resultsKey = flatSuggestions.map(getSearchResultKey).join('|')
		if (previousResultsKeyRef.current === resultsKey) return
		previousResultsKeyRef.current = resultsKey
		setSelectedIndex(-1)
	}, [flatSuggestions])

	// click outside (TODO: move focus from input to results menu)
	React.useEffect(() => {
		if (!showResults) return
		const onMouseDown = (event: MouseEvent) => {
			if (
				resultsRef.current &&
				!resultsRef.current.contains(event.target as Node) &&
				inputRef.current &&
				!inputRef.current.contains(event.target as Node)
			) {
				closeResults()
			}
		}
		document.addEventListener('mousedown', onMouseDown)
		return () => document.removeEventListener('mousedown', onMouseDown)
	}, [showResults, inputRef, closeResults])

	React.useEffect(() => {
		const root = rootRef.current
		if (!root) return

		const onFocusOut = (event: FocusEvent) => {
			const nextTarget = event.relatedTarget
			if (nextTarget && root.contains(nextTarget as Node)) return
			closeResults()
		}

		root.addEventListener('focusout', onFocusOut)
		return () => root.removeEventListener('focusout', onFocusOut)
	}, [closeResults])

	// cmd+k shortcut
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault()
				inputRef.current?.focus()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [inputRef])

	const rememberSearch = React.useCallback((result: SearchResult) => {
		setRecentSearches((current) => {
			const key = getSearchResultKey(result)
			const next = [
				result,
				...current.filter((item) => getSearchResultKey(item) !== key),
			].slice(0, recentSearchesLimit)
			persistRecentSearches(next)
			return next
		})
	}, [])

	const clearRecentSearches = React.useCallback(() => {
		persistRecentSearches([])
		setRecentSearches([])
		setSelectedIndex(-1)
		setShowResults(false)
	}, [])

	const handleActivate = React.useCallback(
		(data: ManualActivation) => {
			rememberSearch(toManualSearchResult(data))
			submittingRef.current = true
			closeResults()
			onActivate?.(data)
		},
		[onActivate, rememberSearch, closeResults],
	)

	const handleSelect = React.useCallback(
		(result: SearchResult) => {
			rememberSearch(result)
			submittingRef.current = true
			closeResults()

			if (result.type === 'block') {
				const id = String(result.blockNumber)
				onChange?.(id)
				onActivate?.({ type: 'block', value: id })
				return
			}

			if (result.type === 'token') {
				onChange?.(result.address)
				onActivate?.({ type: 'token', value: result.address })
				return
			}

			if (result.type === 'address') {
				onChange?.(result.address)
				onActivate?.({ type: 'address', value: result.address })
				return
			}

			if (result.type === 'transaction') {
				onChange?.(result.hash)
				onActivate?.({ type: 'hash', value: result.hash })
				return
			}
		},
		[onChange, onActivate, rememberSearch, closeResults],
	)

	return (
		<div ref={rootRef} {...styles.root({ wide: Boolean(wide) })}>
			<div ref={externalWrapperRef} {...styles.wrapper()}>
				<form
					ref={formRef}
					autoComplete="off"
					onSubmit={(event) => {
						event.preventDefault()
						if (!formRef.current) return

						const data = new FormData(formRef.current)
						let formValue = data.get('explore-query')
						if (!formValue || typeof formValue !== 'string') return

						formValue = formValue.trim()
						if (!formValue) return

						const normalizedFormValue = normalizeSearchInput(formValue)

						const blockId = parseBlockInput(normalizedFormValue)
						if (blockId !== null) {
							handleActivate({ type: 'block', value: blockId })
							return
						}

						if (Address.validate(normalizedFormValue)) {
							handleActivate({ type: 'address', value: normalizedFormValue })
							return
						}

						if (
							Hex.validate(normalizedFormValue) &&
							Hex.size(normalizedFormValue) === 32
						) {
							handleActivate({ type: 'hash', value: normalizedFormValue })
							return
						}
					}}
					{...styles.form()}
				>
					<input
						ref={inputRef}
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						tabIndex={tabIndex}
						value={value}
						{...styles.input({ className, size })}
						data-1p-ignore
						name="explore-query"
						placeholder="Search address, hash, block, token"
						enterKeyHint="search"
						spellCheck={false}
						type="text"
						onKeyDown={(event) => {
							if (event.key === 'Escape' && showResults) {
								event.preventDefault()
								setShowResults(false)
								setSelectedIndex(-1)
								return
							}

							if (!showResults || flatSuggestions.length === 0) return

							if (event.key === 'ArrowDown') {
								event.preventDefault()
								setSelectedIndex((prev) =>
									prev < flatSuggestions.length - 1 ? prev + 1 : 0,
								)
								return
							}

							if (event.key === 'ArrowUp') {
								event.preventDefault()
								setSelectedIndex((prev) =>
									prev > 0 ? prev - 1 : flatSuggestions.length - 1,
								)
								return
							}

							if (event.key === 'Enter') {
								const index = selectedIndex >= 0 ? selectedIndex : 0
								if (index < flatSuggestions.length) {
									event.preventDefault()
									handleSelect(flatSuggestions[index])
								}
								return
							}
						}}
						onChange={(event) => {
							setHasFocus(true)
							onChange?.(event.target.value)
						}}
						onFocus={() => {
							setHasFocus(true)
							if (query.length > 0 || recentSearches.length > 0)
								setShowResults(true)
						}}
						role="combobox"
						aria-expanded={showResults}
						aria-haspopup="listbox"
						aria-autocomplete="list"
						aria-controls={resultsId}
						aria-activedescendant={
							selectedIndex !== -1 ? `${resultsId}-${selectedIndex}` : undefined
						}
						title="Search by Address / Tx Hash / Block / Token (Cmd+K to focus)"
					/>
					<div {...styles.submitSlot({ size })}>
						{/* TDS IconButton owns the size, fill, and focus ring. The local
						    style dims the arrow while the query is not a valid target. */}
						<IconButton
							type="submit"
							aria-label="Search"
							aria-disabled={!isValidInput}
							scale="small"
							variant="secondary"
							{...cx(styles.submit(), transitionColors(), pressDown())}
						>
							<ArrowRight />
						</IconButton>
					</div>
				</form>
			</div>

			{menuMounted && (
				<div
					ref={resultsRef}
					id={resultsId}
					role="listbox"
					aria-label="Search suggestions"
					{...styles.results({ style: { opacity: 0 } })}
				>
					<ProgressLine
						loading={isFetching}
						start={150}
						className={styles.resultsProgress().className}
					/>
					{flatSuggestions.length === 0 ? (
						<div {...styles.resultsEmpty()}>
							{isError
								? 'Search unavailable. Paste an address, hash, or block number.'
								: isFetching
									? 'Searching…'
									: 'No results'}
						</div>
					) : (
						<div {...styles.groups()}>
							{groupedSuggestions.map((group, groupIndex) => (
								<div key={group.type} {...styles.group()}>
									<div {...styles.groupHeader({ spaced: groupIndex > 0 })}>
										<div {...styles.groupTitle()}>{group.title}</div>
										{group.type === 'recent' ? (
											<button
												type="button"
												{...cx(styles.clearRecent(), transitionColors())}
												onMouseDown={(event) => event.preventDefault()}
												onClick={clearRecentSearches}
											>
												Clear
											</button>
										) : (
											<div {...styles.groupMeta()}>
												{group.type === 'token'
													? 'Address'
													: group.type === 'transaction'
														? 'Time'
														: ''}
											</div>
										)}
									</div>
									{group.items.map((item) => {
										const flatIndex = flatSuggestions.indexOf(item)
										const key =
											item.type === 'transaction'
												? `tx-${item.hash}`
												: item.type === 'block'
													? `block-${item.blockNumber}`
													: `${item.type}-${item.address}`
										return (
											<ExploreInput.SuggestionItem
												key={key}
												suggestion={item}
												isSelected={flatIndex === selectedIndex}
												onSelect={handleSelect}
												id={`${resultsId}-${flatIndex}`}
											/>
										)
									})}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}

export namespace ExploreInput {
	export type ValueType = 'address' | 'hash' | 'block'

	export interface Props {
		onActivate?: (
			data:
				| { value: Address.Address; type: 'address' }
				| { value: Address.Address; type: 'token' }
				| { value: Hex.Hex; type: 'hash' }
				| { value: string; type: 'block' },
		) => void
		inputRef?: React.RefObject<HTMLInputElement | null>
		wrapperRef?: React.RefObject<HTMLDivElement | null>
		value: string
		onChange: (value: string) => void
		size?: 'large' | 'medium'
		className?: string
		wide?: boolean
		tabIndex?: number
		autoFocus?: boolean
	}

	export type SuggestionGroup = {
		type: 'recent' | 'token' | 'address' | 'transaction' | 'block'
		title: string
		items: SearchResult[]
	}

	export function SuggestionItem(props: SuggestionItem.Props) {
		const { suggestion, isSelected, onSelect, id } = props
		const itemRef = React.useRef<HTMLButtonElement>(null)

		React.useEffect(() => {
			if (isSelected) itemRef.current?.scrollIntoView({ block: 'nearest' })
		}, [isSelected])

		return (
			<button
				ref={itemRef}
				id={id}
				type="button"
				role="option"
				aria-selected={isSelected}
				onMouseDown={(event) => {
					event.preventDefault()
					onSelect(suggestion)
				}}
				onClick={(event) => {
					if (event.detail === 0) onSelect(suggestion)
				}}
				{...cx(
					styles.suggestion({ selected: isSelected }),
					transitionColors(),
					pressDown(),
				)}
			>
				{suggestion.type === 'block' && (
					<span {...styles.blockNumber()}>#{suggestion.blockNumber}</span>
				)}
				{suggestion.type === 'token' && (
					<>
						<div {...styles.tokenInfo()}>
							<span {...cx(styles.tokenName(), truncate())}>
								{suggestion.name}
							</span>
							<span {...styles.chip({ emphasis: 'primary' })}>
								{suggestion.symbol}
							</span>
							<span {...styles.chip()}>TIP-20</span>
						</div>
						<span {...cx(styles.tokenAddress(), link())}>
							<Midcut value={suggestion.address} prefix="0x" align="end" />
						</span>
					</>
				)}
				{suggestion.type === 'address' && (
					<>
						<div {...styles.addressInfo()}>
							<div {...styles.addressHeading()}>
								{suggestion.label ? (
									<span {...cx(styles.addressLabel(), truncate())}>
										{suggestion.label}
									</span>
								) : (
									<span {...cx(styles.addressHash({ grow: true }), link())}>
										<Midcut value={suggestion.address} prefix="0x" />
									</span>
								)}
								{suggestion.category ? (
									<span {...styles.chip()}>{suggestion.category}</span>
								) : suggestion.isTip20 ? (
									<span {...styles.chip()}>TIP-20</span>
								) : null}
							</div>
							{suggestion.label && (
								<span {...cx(styles.addressHash(), link())}>
									<Midcut value={suggestion.address} prefix="0x" />
								</span>
							)}
						</div>
						{suggestion.description && (
							<span {...styles.addressDescription()}>
								{suggestion.description}
							</span>
						)}
					</>
				)}
				{suggestion.type === 'transaction' && (
					<>
						<span {...cx(styles.transactionHash(), truncate(), link())}>
							<Midcut value={suggestion.hash} prefix="0x" />
						</span>
						{suggestion.timestamp ? (
							<RelativeTime
								timestamp={BigInt(suggestion.timestamp)}
								{...styles.meta()}
							/>
						) : (
							<span {...styles.meta()}>−</span>
						)}
					</>
				)}
			</button>
		)
	}

	export namespace SuggestionItem {
		export interface Props {
			suggestion: SearchResult
			isSelected: boolean
			onSelect: (suggestion: SearchResult) => void
			id: string
		}
	}
}

// Floating panels use the TDS popover elevation.
const panelShadow = {
	boxShadow: `0 1px 2px ${vars.color.shadow.secondary}, 0 8px 24px ${vars.color.shadow.primary}`,
} as const

namespace styles {
	export const root = variants({
		base: { position: 'relative', width: '100% !custom', zIndex: 10 },
		defaultVariants: { wide: false },
		variants: { wide: { true: {}, false: { maxWidth: '448px !custom' } } },
	})

	export const wrapper = style({ overflow: 'hidden' })

	export const form = style({ position: 'relative', width: '100% !custom' })

	// A native input in the TDS TextInput style. It keeps 16px type so iOS does
	// not zoom on focus. The wrapper clips overflow, so the document focus ring
	// is drawn inside the field.
	export const input = variants({
		base: {
			backgroundColor: 'component.input.primary.fill',
			border: 'none !custom',
			borderRadius: 'xs',
			boxSizing: 'border-box',
			color: 'content.primary',
			paddingLeft: '16',
			paddingRight: '48',
			typography: 'body.b1',
			width: '100% !custom',
			'::placeholder': { color: 'content.tertiary' },
			':focus-visible': { outlineOffset: '-2px' },
		},
		defaultVariants: { size: 'medium' },
		variants: {
			size: { large: { height: '48' }, medium: { height: '40' } },
		},
	})

	export const submitSlot = variants({
		base: {
			display: 'flex',
			position: 'absolute',
			top: '50% !custom',
			translate: '0 -50% !custom',
		},
		defaultVariants: { size: 'medium' },
		variants: {
			size: { large: { right: '8' }, medium: { right: '4' } },
		},
	})

	export const submit = style({
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
		selectors: {
			'&[aria-disabled="true"]': {
				color: 'content.tertiary',
				cursor: 'default',
			},
		},
	})

	export const results = style({
		...panelShadow,
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		left: '0px !custom',
		marginTop: '8',
		maxHeight: 'min(420px, 50dvh) !custom',
		overflowX: 'hidden',
		overflowY: 'auto',
		overscrollBehavior: 'contain',
		position: 'absolute',
		right: '0px !custom',
		zIndex: 50,
	})

	export const resultsProgress = style({
		left: '0px !custom',
		position: 'absolute',
		right: '0px !custom',
		top: '0px !custom',
	})

	export const resultsEmpty = style({
		color: 'content.tertiary',
		paddingBlock: '12',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const groups = style({
		display: 'flex',
		flexDirection: 'column',
		paddingBlock: '4',
	})

	export const group = style({ display: 'flex', flexDirection: 'column' })

	export const groupHeader = variants({
		base: {
			alignItems: 'center',
			display: 'flex',
			justifyContent: 'space-between',
			paddingBlock: '8',
			paddingInline: '12',
		},
		defaultVariants: { spaced: false },
		variants: { spaced: { true: { paddingTop: '12' }, false: {} } },
	})

	export const groupTitle = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const groupMeta = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})

	export const clearRecent = style({
		color: 'content.tertiary',
		cursor: 'pointer',
		typography: 'body.b3',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
	})

	export const suggestion = variants({
		base: {
			alignItems: 'center',
			cursor: 'pointer',
			display: 'flex',
			gap: '8',
			justifyContent: 'space-between',
			overflow: 'hidden',
			paddingBlock: '8',
			paddingInline: '12',
			textAlign: 'left',
			width: '100% !custom',
			'@media (hover: hover)': {
				':hover': { backgroundColor: 'container.regular' },
			},
		},
		defaultVariants: { selected: false },
		variants: {
			selected: {
				true: { backgroundColor: 'container.regular' },
				false: {},
			},
		},
	})

	export const blockNumber = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		typography: 'body.b1',
	})

	export const tokenInfo = style({
		alignItems: 'center',
		display: 'flex',
		flexShrink: 1,
		gap: '8',
		minWidth: '0px !custom',
	})

	export const tokenName = style({
		color: 'content.primary',
		typography: 'body.b1',
	})

	// Compact metadata chip. TDS Badge has an 80px minimum width and a 28px
	// height, too large for suggestion rows.
	export const chip = variants({
		base: {
			backgroundColor: 'container.subtle',
			borderRadius: '3xs',
			color: 'content.tertiary',
			flexShrink: 0,
			paddingBlock: '2',
			paddingInline: '4',
			typography: 'body.b3',
		},
		defaultVariants: { emphasis: 'tertiary' },
		variants: {
			emphasis: {
				primary: { color: 'content.primary' },
				tertiary: {},
			},
		},
	})

	export const tokenAddress = style({
		typography: 'mono.inline',
		flex: 1,
		textAlign: 'right',
	})

	export const addressInfo = style({
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		minWidth: '0px !custom',
		overflow: 'hidden',
	})

	export const addressHeading = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		maxWidth: '100% !custom',
		minWidth: '0px !custom',
	})

	export const addressLabel = style({
		color: 'content.primary',
		minWidth: '0px !custom',
		typography: 'body.b2',
	})

	export const addressHash = variants({
		base: {
			typography: 'mono.inline',
			display: 'block',
			maxWidth: '100% !custom',
			minWidth: '0px !custom',
			overflow: 'hidden',
		},
		defaultVariants: { grow: false },
		variants: { grow: { true: { flex: 1 }, false: {} } },
	})

	export const addressDescription = style({
		color: 'content.secondary',
		display: 'none',
		flexShrink: 0,
		textAlign: 'right',
		typography: 'body.b2',
		width: '44% !custom',
		'@media (width >= 640px)': { display: 'block' },
	})

	export const transactionHash = style({
		typography: 'mono.inline',
		flex: 1,
		minWidth: '0px !custom',
	})

	export const meta = style({
		color: 'content.tertiary',
		typography: 'body.b3',
	})
}
